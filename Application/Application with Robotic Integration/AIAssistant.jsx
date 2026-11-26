import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import html2pdf from 'html2pdf.js';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#a4de6c', '#d0ed57', '#a4c8e0'];

export default function AIAssistant({ apiKey, setApiKey, session, lang }) {
  const [provider, setProvider] = useState('gemini');
  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem('tgqc_openaiKey') || '');
  const [groqKey, setGroqKey] = useState(() => localStorage.getItem('tgqc_groqKey') || '');
  
  React.useEffect(() => { localStorage.setItem('tgqc_openaiKey', openaiKey); }, [openaiKey]);
  React.useEffect(() => { localStorage.setItem('tgqc_groqKey', groqKey); }, [groqKey]);

  const activeKey = provider === 'gemini' ? apiKey : provider === 'openai' ? openaiKey : groqKey;

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);
  const chatRef = useRef(null);

  const handleSend = async () => {
    if (!input.trim() || !activeKey) return;
    
    const userMsg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({ apiKey: activeKey, prompt: userMsg.content, lang, provider, fromDate, toDate })
      });
      const data = await res.json();
      
      if (data.error) {
        setMessages(prev => [...prev, { role: 'ai', content: `**Error:** ${data.error}` }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', content: data.answer }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', content: '**Error:** Failed to connect to server.' }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSend();
  };

  const downloadPDF = () => {
    const element = chatRef.current;
    if (!element) return;
    const opt = {
      margin: 0.5,
      filename: 'AI_Factory_Report.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#0a0a0a' },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  };

  const downloadExcel = () => {
    // Basic export of all chat messages to excel sheet
    const ws = XLSX.utils.json_to_sheet(messages.map(m => ({ Role: m.role.toUpperCase(), Content: m.content })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AI Insights");
    XLSX.writeFile(wb, "AI_Factory_Data.xlsx");
  };

  // Custom Markdown renderer to intercept charts
  const components = {
    code({node, inline, className, children, ...props}) {
      const match = /language-(\w+)/.exec(className || '');
      const content = String(children).trim();
      
      const isLikelyChart = !inline && (className === 'language-chart' || className === 'language-json' || content.includes('"type":'));
      
      if (isLikelyChart) {
         try {
           const chartData = JSON.parse(content);
           if (chartData.type === 'bar') {
              return (
                <div style={styles.chartContainer}>
                  <h4 style={styles.chartTitle}>{chartData.title}</h4>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                      <XAxis dataKey="name" stroke="#ccc" />
                      <YAxis stroke="#ccc" />
                      <RechartsTooltip contentStyle={{backgroundColor: '#222', borderColor: '#444', color: '#fff'}} />
                      <Legend />
                      <Bar dataKey="value" fill="#8884d8" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
           } else if (chartData.type === 'pie') {
              return (
                <div style={styles.chartContainer}>
                  <h4 style={styles.chartTitle}>{chartData.title}</h4>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={chartData.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                        {chartData.data.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{backgroundColor: '#222', borderColor: '#444', color: '#fff'}} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              );
           } else if (chartData.type === 'line') {
              return (
                <div style={styles.chartContainer}>
                  <h4 style={styles.chartTitle}>{chartData.title}</h4>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                      <XAxis dataKey="name" stroke="#ccc" />
                      <YAxis stroke="#ccc" />
                      <RechartsTooltip contentStyle={{backgroundColor: '#222', borderColor: '#444', color: '#fff'}} />
                      <Legend />
                      <Line type="monotone" dataKey="value" stroke="#ff7300" strokeWidth={3} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
           }
         } catch(e) {
            return <code className={className} {...props}>{children}</code>;
         }
      }
      return <code className={className} {...props}>{children}</code>;
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div>
            <h2 style={{ margin: '0 0 8px 0' }}>{lang === 'it' ? 'Analista Dati AI' : 'AI Factory Data Analyst'}</h2>
            <p style={{ color: '#aaa', margin: 0 }}>
              {lang === 'it' 
                ? 'Fai a Gemini qualsiasi domanda complessa sui tuoi dati di produzione. Genera Grafici o Rapporti in PDF/Excel.' 
                : 'Ask AI any complex question about your production data. Generate Charts, PDFs, or Excel Reports.'}
            </p>
          </div>
          <select 
            value={provider} 
            onChange={e => setProvider(e.target.value)}
            style={styles.providerSelect}
          >
            <option value="gemini">Google Gemini (Flash)</option>
            <option value="openai">OpenAI ChatGPT (GPT-4o)</option>
            <option value="groq">Meta Llama 3 (Groq)</option>
          </select>
          {activeKey && (
            <button 
              onClick={() => {
                if (provider === 'gemini') setApiKey('');
                else if (provider === 'openai') setOpenaiKey('');
                else setGroqKey('');
              }}
              style={{
                background: 'transparent', border: '1px solid #555', color: '#fff', 
                padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem'
              }}
            >
              {lang === 'it' ? 'Cambia Chiave API' : 'Change API Key'}
            </button>
          )}
        </div>
        <div style={styles.actionButtons}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: '#aaa', fontSize: '0.9rem' }}>{lang === 'it' ? 'Da:' : 'From:'}</span>
            <input 
              type="date" 
              value={fromDate} 
              onChange={e => setFromDate(e.target.value)} 
              onClick={(e) => e.target.showPicker && e.target.showPicker()}
              style={styles.dateInput} 
            />
            <span style={{ color: '#aaa', fontSize: '0.9rem' }}>{lang === 'it' ? 'A:' : 'To:'}</span>
            <input 
              type="date" 
              value={toDate} 
              onChange={e => setToDate(e.target.value)} 
              onClick={(e) => e.target.showPicker && e.target.showPicker()}
              style={styles.dateInput} 
            />
          </div>
          <button onClick={downloadPDF} style={styles.exportBtn}>
            📄 {lang === 'it' ? 'Scarica PDF' : 'Export PDF'}
          </button>
          <button onClick={downloadExcel} style={styles.exportBtn}>
            📊 {lang === 'it' ? 'Esporta Excel' : 'Export Excel'}
          </button>
        </div>
      </div>
      
      {!activeKey ? (
        <div style={styles.apiKeyWarning}>
          <div style={{ marginBottom: 16, fontSize: '1.2rem' }}>
            {lang === 'it' 
              ? `Inserisci la tua chiave API ${provider === 'gemini' ? 'Google Gemini' : provider === 'openai' ? 'OpenAI' : 'Groq'} per attivare l'Analista AI.` 
              : `Please enter your ${provider === 'gemini' ? 'Google Gemini' : provider === 'openai' ? 'OpenAI' : 'Groq'} API Key to enable the AI Data Analyst.`}
          </div>
          <input 
            type="text" 
            placeholder={provider === 'openai' ? "sk-proj-..." : provider === 'groq' ? "gsk_..." : "AIzaSy..."} 
            style={styles.keyInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.target.value.trim()) {
                const val = e.target.value.trim();
                if (provider === 'gemini') setApiKey(val);
                else if (provider === 'openai') setOpenaiKey(val);
                else setGroqKey(val);
              }
            }}
          />
          <div style={{ fontSize: 13, color: '#aaa', marginTop: 16 }}>
            {lang === 'it' ? 'Ottieni una chiave gratuita su' : 'Get a key from'} 
            <a href={provider === 'gemini' ? "https://aistudio.google.com" : provider === 'openai' ? "https://platform.openai.com/api-keys" : "https://console.groq.com/keys"} 
               target="_blank" rel="noreferrer" style={{ color: '#fff', marginLeft: '4px' }}>
              {provider === 'gemini' ? 'aistudio.google.com' : provider === 'openai' ? 'platform.openai.com' : 'console.groq.com'}
            </a>
          </div>
        </div>
      ) : (
        <div style={styles.chatArea}>
          <div style={styles.messagesContainer} ref={chatRef}>
            {messages.length === 0 && (
              <div style={styles.welcomeMsg}>
                {lang === 'it' ? (
                  <>
                    Ciao {session.name}! Sono il tuo Analista Dati AI.<br/><br/>
                    Prova a chiedermi cose come: <br/>
                    <i>"Disegna un grafico a torta dei difetti più comuni."</i><br/>
                    <i>"Fammi un grafico a barre del volume di produzione per marchio."</i><br/>
                    <i>"Genera un report esecutivo sulle performance di questa settimana."</i>
                  </>
                ) : (
                  <>
                    Hello {session.name}! I am your AI QC Data Analyst.<br/><br/>
                    Try asking me things like: <br/>
                    <i>"Draw a pie chart of the most common factory defects."</i><br/>
                    <i>"Show me a bar chart of our production volume by brand."</i><br/>
                    <i>"Generate a full executive report on this week's performance."</i>
                  </>
                )}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={m.role === 'user' ? styles.userMessageRow : styles.aiMessageRow}>
                <div style={m.role === 'user' ? styles.userBubble : styles.aiBubble}>
                  {m.role === 'user' ? (
                    m.content
                  ) : (
                    <ReactMarkdown components={components}>{m.content}</ReactMarkdown>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div style={styles.aiMessageRow}>
                <div style={styles.aiBubble}>Thinking...</div>
              </div>
            )}
          </div>
          
          <div style={styles.inputArea}>
            <input 
              type="text" 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              onKeyDown={handleKeyDown}
              placeholder={lang === 'it' ? "Fai una domanda o richiedi un grafico..." : "Ask a question or request a chart..."}
              style={styles.input}
            />
            <button onClick={handleSend} style={styles.sendBtn} disabled={loading || !input.trim()}>
              {lang === 'it' ? 'Invia' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex', flexDirection: 'column', height: '100%',
    backgroundColor: '#0a0a0a', color: '#eee',
    borderRadius: '8px', overflow: 'hidden',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    border: '1px solid #333'
  },
  header: {
    padding: '24px', borderBottom: '1px solid #333',
    backgroundColor: '#111', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
  },
  actionButtons: {
    display: 'flex', gap: '12px'
  },
  exportBtn: {
    padding: '8px 16px', borderRadius: '6px', border: '1px solid #444',
    backgroundColor: '#222', color: '#fff', cursor: 'pointer', fontSize: '0.9rem',
    display: 'flex', alignItems: 'center', gap: '8px'
  },
  chatArea: {
    display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden'
  },
  messagesContainer: {
    flex: 1, padding: '24px', overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: '20px'
  },
  welcomeMsg: {
    textAlign: 'center', color: '#888', marginTop: '40px', fontSize: '1.1rem', lineHeight: '1.6'
  },
  userMessageRow: {
    display: 'flex', justifyContent: 'flex-end'
  },
  aiMessageRow: {
    display: 'flex', justifyContent: 'flex-start'
  },
  userBubble: {
    backgroundColor: '#2a2a2a', color: '#fff',
    padding: '12px 20px', borderRadius: '20px', maxWidth: '70%',
    fontSize: '1rem', lineHeight: '1.5'
  },
  aiBubble: {
    backgroundColor: 'transparent', color: '#ddd',
    padding: '12px 20px', borderRadius: '12px', maxWidth: '100%',
    fontSize: '1rem', lineHeight: '1.6', width: '100%'
  },
  inputArea: {
    padding: '20px', borderTop: '1px solid #333', display: 'flex', gap: '12px',
    backgroundColor: '#111'
  },
  input: {
    flex: 1, padding: '16px', borderRadius: '12px', border: '1px solid #444',
    backgroundColor: '#000', color: '#fff', outline: 'none', fontSize: '1.1rem'
  },
  sendBtn: {
    padding: '12px 24px', borderRadius: '12px', border: 'none',
    backgroundColor: '#fff', color: '#000', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem'
  },
  apiKeyWarning: {
    padding: '40px', textAlign: 'center', color: '#eee',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1
  },
  keyInput: {
    width: '400px', padding: '12px', borderRadius: '8px', border: '1px solid #444',
    backgroundColor: '#000', color: '#fff', outline: 'none', textAlign: 'center', fontSize: '1.2rem'
  },
  providerSelect: {
    padding: '10px 16px', borderRadius: '8px', border: '1px solid #555',
    backgroundColor: '#111', color: '#fff', fontSize: '1rem', outline: 'none',
    cursor: 'pointer', minWidth: '200px'
  },
  dateInput: {
    padding: '8px 12px', borderRadius: '6px', border: '1px solid #555',
    backgroundColor: '#111', color: '#fff', fontSize: '0.9rem', outline: 'none',
    cursor: 'pointer'
  },
  chartContainer: {
    width: '100%', height: 350, backgroundColor: '#181818', 
    borderRadius: 8, padding: 16, margin: '16px 0', border: '1px solid #333'
  },
  chartTitle: {
    color: '#fff', textAlign: 'center', margin: '0 0 16px 0', fontSize: '1.2rem'
  }
};
