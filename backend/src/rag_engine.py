import os
from dotenv import load_dotenv

# --- UPDATED IMPORTS ---
from langchain_neo4j import Neo4jGraph, Neo4jVector, GraphCypherQAChain
from langchain_huggingface import HuggingFaceEmbeddings
# -----------------------

from langchain_core.prompts import PromptTemplate
from langchain_groq import ChatGroq

load_dotenv()

# 1. Setup Graph Connection
graph = Neo4jGraph(
    url=os.getenv("NEO4J_URI"),
    username=os.getenv("NEO4J_USERNAME"),
    password=os.getenv("NEO4J_PASSWORD"),
    database=os.getenv("NEO4J_DATABASE")  # Fixed: use NEO4J_DATABASE not NEO4J_USERNAME
)
# 2. Setup LLM & Embeddings
llm = ChatGroq(temperature=0, model_name="llama-3.3-70b-versatile")
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# 3. Setup Vector Search Retriever (lazy-loaded to avoid crash if index doesn't exist yet)
_vector_store = None

def get_vector_store():
    global _vector_store
    if _vector_store is None:
        _vector_store = Neo4jVector.from_existing_graph(
            embedding=embeddings,
            url=os.getenv("NEO4J_URI"),
            username=os.getenv("NEO4J_USERNAME"),
            password=os.getenv("NEO4J_PASSWORD"),
            database=os.getenv("NEO4J_DATABASE"),  # Fixed: use NEO4J_DATABASE
            index_name="vector_index",
            node_label="Chunk",
            text_node_properties=["text"],
            embedding_node_property="embedding"
        )
    return _vector_store

# 4. Setup Graph Search (Cypher)
# 4. Setup Graph Search (Cypher)
cypher_generation_template = """
Task: Generate a Neo4j Cypher statement to query a graph database.

Strict Rules:
1. Use ONLY the exact relationship types and properties provided in the Schema.
2. Use the '.id' property for node matching.
3. Use case-insensitive matching using toLower().
4. You MUST use simple, single-hop relationships. DO NOT use variable-length paths. NO asterisks (*), NO plus signs (+).

Good Example (DO THIS):
MATCH (p:Person {{id: toLower('Akash Ambani')}})-[:LEADS]->(o:Organization) RETURN p, o

Bad Example (NEVER DO THIS):
MATCH (p:Person)-[:LEADS|FOUNDER]*-(o:Organization) RETURN p, o

Schema:
{schema}

Question: {question}
Cypher Query:"""

CYPHER_PROMPT = PromptTemplate(
    input_variables=["schema", "question"], 
    template=cypher_generation_template
)
graph_chain = GraphCypherQAChain.from_llm(
    llm=llm,
    graph=graph,
    verbose=True,
    cypher_prompt=CYPHER_PROMPT,
    allow_dangerous_requests=True,
    return_direct=True # We want the raw graph data, not a final answer yet
)

# 5. The Hybrid Logic (Graph + Vector)
def get_answer(question):
    try:
        print(f"--> Question: {question}")
        
        # A. Run Graph Search - SAFELY PARSED
        graph_result = "No relevant graph connections found."
        try:
            graph_data = graph_chain.invoke({"query": question})  # Fixed: invoke needs a dict
            
            # Check if 'result' exists AND is not an empty list [] or empty string ""
            if 'result' in graph_data and graph_data['result']:
                graph_result = str(graph_data['result'])
                
        except Exception as e:
            graph_result = f"Graph search failed: {str(e)}"

        # B. Run Vector Search (Semantic)
        vector_results = get_vector_store().similarity_search(question, k=2)
        vector_text = "\n".join([doc.page_content for doc in vector_results])
        
        # C. Combine Contexts
        final_context = f"""
        GRAPH FINDINGS:
        {graph_result}

        TEXT FINDINGS:
        {vector_text}
        """

        # D. Generate Final Answer
        final_prompt = f"""
        You are a helpful assistant. Use the context below to answer the question in PURE HINDI.
        If the information is missing, say "मुझे जानकारी नहीं मिली".

        Context:
        {final_context}

        Question: {question}
        
        Answer (in Hindi):
        """
        
        response = llm.invoke(final_prompt)
        
        # --- NEW: Return the sources alongside the answer! ---
        return {
            "answer": response.content,
            "sources": {
                "graph": graph_result,
                "text": vector_text
            }
        }

    except Exception as e:
        return {"answer": f"Error: {e}", "sources": None}

def get_graph_data():
    try:
        # Run a refined Cypher query to get nodes, their labels, and relationship types
        # Note: We prioritize the first label as the type.
        query = """
        MATCH (n)-[r]->(m)
        RETURN elementId(n) AS source_uid, n.id AS source_name, labels(n)[0] AS source_type,
               elementId(m) AS target_uid, m.id AS target_name, labels(m)[0] AS target_type,
               type(r) AS rel_type
        LIMIT 150
        """
        results = graph.query(query)
        
        nodes_dict = {}
        links = []
        
        for record in results:
            # Map the unique Neo4j ElementID to a clean 'id' for the frontend library
            s_uid = record['source_uid']
            t_uid = record['target_uid']

            # Process Source Node (using ElementID for uniqueness)
            if s_uid not in nodes_dict:
                nodes_dict[s_uid] = {
                    "id": s_uid,  # react-force-graph uses this for linking
                    "name": record['source_name'], # This is what we display
                    "type": record['source_type']
                }
            
            # Process Target Node
            if t_uid not in nodes_dict:
                nodes_dict[t_uid] = {
                    "id": t_uid, 
                    "name": record['target_name'], 
                    "type": record['target_type']
                }
            
            # Process Link
            links.append({
                "source": s_uid, # Links to the unique ID
                "target": t_uid,
                "label": record['rel_type']
            })
            
        return {
            "nodes": list(nodes_dict.values()),
            "links": links
        }
    except Exception as e:
        print(f"Error fetching graph data: {e}")
        return {"nodes": [], "links": []}