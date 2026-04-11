import os
from dotenv import load_dotenv

from langchain_neo4j import Neo4jGraph, Neo4jVector
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_experimental.graph_transformers import LLMGraphTransformer
from langchain_groq import ChatGroq
from langchain_core.documents import Document

load_dotenv()

# 1. Connect to Database
graph = Neo4jGraph(
    url=os.getenv("NEO4J_URI"),
    username=os.getenv("NEO4J_USERNAME"),
    password=os.getenv("NEO4J_PASSWORD")
)

# 2. Initialize LLM (for Graph Extraction)
llm = ChatGroq(temperature=0, model_name="llama-3.3-70b-versatile")

# --- THE FIX ---
# Define allowed nodes and edges so Groq doesn't try to dynamically 
# generate a schema, which causes the tool_use_failed 400 error.
allowed_nodes = [
    "Person", "Organization", "Location", "Event", 
    "Concept", "Technology", "Mission", "Spacecraft"
]
allowed_edges = [
    "INVOLVES", "LOCATED_IN", "PART_OF", "CREATED", 
    "LEADS", "UTILIZES", "CARRIES", "AFFILIATED_WITH"
]

llm_transformer = LLMGraphTransformer(
    llm=llm,
    allowed_nodes=allowed_nodes,
    allowed_relationships=allowed_edges
)
# ---------------

# 3. Initialize Embeddings (for Vector Search) - Runs Locally & Free
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

def ingest_text(text, metadata):
    print(f"--> Processing: {metadata['title']}")
    
    doc = Document(page_content=text, metadata=metadata)
    
    # --- PART A: GRAPH EXTRACTION (Entities & Relationships) ---
    print("--> Extracting Entities & Relationships...")
    
    try:
        # Added a try-except block here just in case Groq hiccups again
        graph_documents = llm_transformer.convert_to_graph_documents([doc])
        if graph_documents:
            graph.add_graph_documents(graph_documents)
            print(f"--> Graph Data: Added {len(graph_documents[0].nodes)} nodes, {len(graph_documents[0].relationships)} edges.")
    except Exception as e:
        print(f"--> Graph Extraction Failed: {e}")
        print("--> Proceeding with Vector indexing only...")
    
    # --- PART B: VECTOR INDEXING (Semantic Search) ---
    print("--> Creating Vector Index...")
    Neo4jVector.from_documents(
        [doc],
        embeddings,
        url=os.getenv("NEO4J_URI"),
        username=os.getenv("NEO4J_USERNAME"),
        password=os.getenv("NEO4J_PASSWORD"),
        index_name="vector_index",   
        node_label="Chunk",          
        text_node_property="text",   
        embedding_node_property="embedding" 
    )
    print("--> Vector Index Created Successfully!")

if __name__ == "__main__":
    # Test
    sample_text = "Elon Musk is the CEO of SpaceX."
    meta = {"year": 2023, "source": "Test", "title": "Test Input"}
    ingest_text(sample_text, meta)