import { useState, useRef, useEffect } from 'react'
import ForceGraph2D from 'react-force-graph-2d'

export default function App() {
  const [activeTab, setActiveTab] = useState('chat') 
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)

  // --- NEW: Ingest State (Text vs File) ---
  const [ingestMode, setIngestMode] = useState('text') // 'text' or 'file'
  const [ingestText, setIngestText] = useState('')
  const [file, setFile] = useState(null)
  
  const [year, setYear] = useState(new Date().getFullYear())
  const [author, setAuthor] = useState('')
  const [isIngestLoading, setIsIngestLoading] = useState(false)
  
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  
  const chatEndRef = useRef(null)
  const fgRef = useRef()

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (activeTab === 'graph') {
      fetch('http://localhost:8000/api/graph')
        .then(res => res.json())
        .then(data => setGraphData(data))
        .catch(err => console.error("Failed to load graph data", err))
    }
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'graph' && fgRef.current) {
      fgRef.current.d3Force('charge').strength(-400);
      fgRef.current.d3Force('charge').distanceMax(400);
      fgRef.current.d3Force('link').distance(120);
      fgRef.current.d3ReheatSimulation();
    }
  }, [activeTab, graphData]);

  const nodeTypeColors = {
    "Organization": "#10b981", 
    "Person": "#ef4444",       
    "Location": "#f59e0b",     
    "Mission": "#f97316",      
    "Spacecraft": "#a855f7",   
    "Technology": "#06b6d4",   
    "Event": "#ec4899",        
    "Concept": "#a1a1aa"       
  }

  const speakHindi = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'hi-IN'
      utterance.rate = 0.9 
      window.speechSynthesis.speak(utterance)
    }
  }

  // --- NEW: Unified Ingest Handler ---
  const handleIngest = async (e) => {
    e.preventDefault()
    if (ingestMode === 'text' && !ingestText) return
    if (ingestMode === 'file' && !file) return
    
    setIsIngestLoading(true)
    
    try {
      let res;
      
      if (ingestMode === 'text') {
        // Old JSON logic
        res = await fetch('http://localhost:8000/api/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: ingestText, year: parseInt(year), author: author || "Unknown" })
        })
      } else {
        // New Multipart Form Logic for Files
        const formData = new FormData()
        formData.append('file', file)
        formData.append('year', year)
        formData.append('author', author || "Unknown")
        
        res = await fetch('http://localhost:8000/api/upload', {
          method: 'POST',
          body: formData 
        })
      }

      if (res.ok) {
        setIngestText('')
        setFile(null)
        setAuthor('')
        alert("Success: Knowledge Graph Updated!")
        if (activeTab === 'graph') setActiveTab('chat') 
      } else {
        const errData = await res.json()
        alert(`Error: ${errData.detail || "Failed to ingest data."}`)
      }
    } catch (err) { 
      alert("Error reaching the backend.") 
    } finally { 
      setIsIngestLoading(false) 
    }
  }

  const handleAsk = async (e) => {
    e.preventDefault()
    if (!input.trim()) return
    const userMsg = { role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsChatLoading(true)
    try {
      const res = await fetch('http://localhost:8000/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMsg.content })
      })
      const data = await res.json()
      // NEW: We now save the sources into the message object!
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.answer,
        sources: data.sources 
      }])
    } catch (err) { alert("Error.") } finally { setIsChatLoading(false) }
  }

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      
      {/* LEFT SIDEBAR */}
      <div className="w-96 lg:w-[420px] shrink-0 bg-slate-800 flex flex-col shadow-2xl z-10 border-r border-slate-700">
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-brand-500 to-emerald-400">
            GraphSumm 🇮🇳
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-medium tracking-wide uppercase">Knowledge Base Manager</p>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto">
          {/* Mode Toggle */}
          <div className="flex bg-slate-900 rounded-lg p-1 mb-6 border border-slate-700">
            <button type="button" onClick={() => setIngestMode('text')} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${ingestMode === 'text' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>Paste Text</button>
            <button type="button" onClick={() => setIngestMode('file')} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${ingestMode === 'file' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>Upload PDF</button>
          </div>

          <form onSubmit={handleIngest} className="flex flex-col gap-5">
            
            {/* Conditional Input Rendering */}
            {ingestMode === 'text' ? (
              <textarea value={ingestText} onChange={e => setIngestText(e.target.value)} placeholder="Paste data here..." className="w-full h-48 p-3 bg-slate-900 border border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none resize-none" />
            ) : (
              <div className="w-full h-48 bg-slate-900 border-2 border-dashed border-slate-600 rounded-xl flex flex-col items-center justify-center p-4 hover:border-brand-500 transition-colors relative">
                <input 
                  type="file" 
                  accept=".pdf" 
                  onChange={e => setFile(e.target.files[0])} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <span className="text-4xl mb-2">📄</span>
                <p className="text-sm font-semibold text-slate-300 text-center">
                  {file ? file.name : "Drag & Drop or Click to Select PDF"}
                </p>
                {file && <p className="text-xs text-brand-400 mt-2">File Ready</p>}
              </div>
            )}

            <div className="flex gap-4">
              <input type="number" value={year} onChange={e => setYear(e.target.value)} className="w-full p-2.5 bg-slate-900 border border-slate-600 rounded-lg text-sm" />
              <input type="text" value={author} onChange={e => setAuthor(e.target.value)} placeholder="Source" className="w-full p-2.5 bg-slate-900 border border-slate-600 rounded-lg text-sm" />
            </div>
            
            <button type="submit" disabled={isIngestLoading || (ingestMode === 'text' ? !ingestText : !file)} className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl disabled:opacity-50 transition-all active:scale-[0.98]">
              {isIngestLoading ? "Extracting Graph Data..." : "Add to Graph"}
            </button>
          </form>
        </div>
      </div>

      {/* RIGHT MAIN */}
      <div className="flex-1 flex flex-col bg-slate-900 relative">
        <div className="flex bg-slate-800 border-b border-slate-700 p-2 gap-2">
          <button onClick={() => setActiveTab('chat')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'chat' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}>💬 Chat Q&A</button>
          <button onClick={() => setActiveTab('graph')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'graph' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}>🕸️ Visualizer</button>
        </div>

        {activeTab === 'chat' && (
          <>
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
                  <span className="text-4xl">✨</span>
                  <h2 className="text-xl font-medium text-slate-300">Ready to Answer</h2>
                </div>
              )}
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-4 rounded-2xl max-w-[85%] lg:max-w-[75%] leading-relaxed shadow-sm text-[15px] relative group ${msg.role === 'user' ? 'bg-brand-600 text-white rounded-br-sm' : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-sm'}`}>
                    
                    {/* The Actual Message Text */}
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    
                    {/* TTS Button */}
                    {msg.role === 'assistant' && (
                      <button onClick={() => speakHindi(msg.content)} className="absolute -right-10 top-2 p-2 bg-slate-800 rounded-full border border-slate-600 opacity-0 group-hover:opacity-100 hover:bg-slate-700 transition-all" title="Listen in Hindi">🔊</button>
                    )}

                    {/* NEW: Collapsible Source Viewer */}
                    {msg.sources && (
                      <details className="mt-4 border-t border-slate-700 pt-3">
                        <summary className="text-xs text-brand-400 font-semibold cursor-pointer hover:text-brand-300 transition-colors select-none outline-none">
                          🔍 View Extraction Sources
                        </summary>
                        <div className="mt-3 flex flex-col gap-3 text-xs bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                          <div>
                            <span className="font-bold text-slate-400 uppercase tracking-wider block mb-1">Graph DB Results:</span>
                            <span className="text-emerald-400 font-mono bg-slate-950 p-2 rounded block break-words">
                              {msg.sources.graph}
                            </span>
                          </div>
                          <div>
                            <span className="font-bold text-slate-400 uppercase tracking-wider block mb-1">Vector DB Chunks:</span>
                            <span className="text-amber-400/90 font-mono bg-slate-950 p-2 rounded block break-words line-clamp-3 hover:line-clamp-none transition-all">
                              {msg.sources.text || "No relevant text chunks found."}
                            </span>
                          </div>
                        </div>
                      </details>
                    )}

                  </div>
                </div>
              ))}
              {isChatLoading && <div className="text-slate-400 text-sm animate-pulse ml-4 mt-4">Thinking...</div>}
              <div ref={chatEndRef} />
            </div>
            <div className="p-4 sm:p-6 bg-slate-900 border-t border-slate-800/50">
              <form onSubmit={handleAsk} className="max-w-4xl mx-auto relative flex items-center">
                <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask a question..." disabled={isChatLoading} className="w-full pl-6 pr-32 py-4 bg-slate-800 border border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:border-brand-500 text-white transition-all disabled:opacity-50" />
                <button type="submit" disabled={isChatLoading || !input.trim()} className="absolute right-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-medium rounded-xl disabled:opacity-50 transition-colors">Send</button>
              </form>
            </div>
          </>
        )}

        {activeTab === 'graph' && (
          <div className="flex-1 bg-slate-950 overflow-hidden relative">
            {graphData.nodes.length > 0 ? (
              <ForceGraph2D
                ref={fgRef}
                graphData={graphData}
                backgroundColor="#020617" 
                nodeLabel="name"
                nodeColor={node => nodeTypeColors[node.type] || '#3b82f6'} 
                linkColor={() => '#475569'}
                nodeRelSize={6}
                linkDirectionalArrowLength={3.5}
                linkDirectionalArrowRelPos={1}
              />
            ) : (
              <div className="h-full h-full flex items-center justify-center text-slate-500 text-center">
                <div>
                  <p className="text-4xl mb-4">🕸️</p>
                  <p className="text-xl">Build your graph first!</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}