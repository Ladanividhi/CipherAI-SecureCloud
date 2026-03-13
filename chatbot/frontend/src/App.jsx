import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import './App.css'

const API = 'http://localhost:8000'

function App() {
  const [pdfFile, setPdfFile] = useState(null)        // uploaded filename
  const [messages, setMessages] = useState([])         // chat history
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)        // bot is typing
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState(null)     // { text, type }
  const [dragOver, setDragOver] = useState(false)

  const fileInputRef = useRef()
  const messagesEndRef = useRef()

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ---- Upload PDF ----
  const handleUpload = async (file) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadMsg({ text: 'Please select a PDF file.', type: 'error' })
      return
    }

    setUploading(true)
    setUploadMsg({ text: 'Processing PDF... This may take a moment.', type: 'loading' })

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await axios.post(`${API}/api/upload`, formData)
      setPdfFile(file.name)
      setMessages([])
      setUploadMsg({ text: `${res.data.message} (${res.data.chunks} chunks, ${res.data.time_seconds}s)`, type: 'success' })
      // Clear upload message after a moment and show chat
      setTimeout(() => setUploadMsg(null), 2000)
    } catch (err) {
      const detail = err.response?.data?.detail || 'Upload failed. Is the backend running?'
      setUploadMsg({ text: detail, type: 'error' })
    } finally {
      setUploading(false)
    }
  }

  // ---- Ask Question ----
  const handleAsk = async () => {
    const question = input.trim()
    if (!question || loading) return

    setMessages(prev => [...prev, { role: 'user', text: question }])
    setInput('')
    setLoading(true)

    try {
      const res = await axios.post(`${API}/api/ask`, { question })
      setMessages(prev => [...prev, { role: 'bot', text: res.data.answer }])
    } catch (err) {
      const detail = err.response?.data?.detail || 'Something went wrong.'
      setMessages(prev => [...prev, { role: 'bot', text: `Error: ${detail}` }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAsk()
    }
  }

  // ---- Reset (upload new PDF) ----
  const handleReset = () => {
    setPdfFile(null)
    setMessages([])
    setUploadMsg(null)
  }

  // ---- Drag & Drop ----
  const handleDrag = (e, over) => {
    e.preventDefault()
    setDragOver(over)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  // ========== RENDER ==========

  // Upload screen
  if (!pdfFile) {
    return (
      <div className="app">
        <div className="header">
          <h1><span>📄</span> PDF Chatbot</h1>
        </div>
        <div className="upload-screen">
          <div
            className={`upload-card ${dragOver ? 'drag-over' : ''}`}
            onDragOver={(e) => handleDrag(e, true)}
            onDragLeave={(e) => handleDrag(e, false)}
            onDrop={handleDrop}
          >
            <div className="upload-icon">📁</div>
            <h2>Upload a PDF</h2>
            <p>Drag & drop your PDF here, or click the button below</p>
            <input
              type="file"
              accept=".pdf"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={(e) => handleUpload(e.target.files[0])}
            />
            <button
              className="upload-btn"
              onClick={() => fileInputRef.current.click()}
              disabled={uploading}
            >
              {uploading ? '⏳ Processing...' : '📎 Choose PDF'}
            </button>
            {uploadMsg && (
              <div className={`upload-status ${uploadMsg.type}`}>
                {uploadMsg.text}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Chat screen
  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <h1><span>📄</span> PDF Chatbot</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
          <div className="file-badge">
            <span className="dot" />
            {pdfFile}
          </div>
          <button className="new-pdf-btn" onClick={handleReset}>
            ✕ New PDF
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-container">
        {messages.length === 0 && !loading ? (
          <div className="welcome">
            <div className="icon">💬</div>
            <h3>Ask anything about your PDF</h3>
            <p>Your document is ready. Type a question below to get started.</p>
          </div>
        ) : (
          <div className="messages">
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                <div className="avatar">
                  {msg.role === 'user' ? '🧑' : '🤖'}
                </div>
                <div className="bubble">{msg.text}</div>
              </div>
            ))}
            {loading && (
              <div className="message bot">
                <div className="avatar">🤖</div>
                <div className="bubble">
                  <div className="typing-dots">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input */}
        <div className="input-bar">
          <input
            type="text"
            placeholder="Ask a question about the PDF..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            className="send-btn"
            onClick={handleAsk}
            disabled={loading || !input.trim()}
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
