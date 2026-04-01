import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Volume2, VolumeX, Database, 
  Settings, Radio, Fingerprint, RefreshCw, 
  CheckCircle2, AlertTriangle, Play, Download
} from 'lucide-react';

// --- Utility: PCM to WAV Conversion ---
function pcmToWav(base64Pcm, sampleRate = 24000) {
  try {
    const binaryString = window.atob(base64Pcm);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const pcmData = bytes.buffer;
    
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmData.byteLength;
    const chunkSize = 36 + dataSize;
    
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    
    const writeString = (view, offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(view, 0, 'RIFF');
    view.setUint32(4, chunkSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); 
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    const pcmView = new Uint8Array(pcmData);
    new Uint8Array(buffer, 44).set(pcmView);
    
    return buffer;
  } catch (e) {
    console.error("PCM to WAV conversion failed:", e);
    return null;
  }
}

// --- Fetch with Backoff ---
async function fetchWithBackoff(url, options, maxRetries = 5) {
  let delay = 1000;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await new Promise(res => setTimeout(res, delay));
      delay *= 2;
    }
  }
}

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  
  const [chatHistory, setChatHistory] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [audioStatus, setAudioStatus] = useState('READY');

  const chatEndRef = useRef(null);
  const audioRef = useRef(new Audio());

  // Load API Key on Mount
  useEffect(() => {
    const storedKey = localStorage.getItem('valindra_gemini_key');
    if (storedKey) {
      setApiKey(storedKey);
      setSelectedModel('gemini-1.5-flash'); 
    } else {
      setIsConfigOpen(true);
    }
  }, []);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const scanModels = async () => {
    if (!apiKey) return;
    setIsScanning(true);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      const data = await fetchWithBackoff(url, { method: 'GET' });
      
      if (data && data.models) {
        const validModels = data.models.filter(m => 
          m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')
        ).map(m => m.name.replace('models/', ''));
        
        setModels(validModels);
        
        if (!validModels.includes(selectedModel)) {
           if (validModels.includes('gemini-2.5-flash-preview-09-2025')) setSelectedModel('gemini-2.5-flash-preview-09-2025');
           else if (validModels.includes('gemini-1.5-flash')) setSelectedModel('gemini-1.5-flash');
           else if (validModels.length > 0) setSelectedModel(validModels[0]);
        }
      }
    } catch (error) {
      console.error("Model scan failed:", error);
      alert("Failed to scan models. Check your API key.");
    } finally {
      setIsScanning(true); 
      setTimeout(() => setIsScanning(false), 500);
    }
  };

  const saveConfig = () => {
    localStorage.setItem('valindra_gemini_key', apiKey);
    setIsConfigOpen(false);
    if (models.length === 0) scanModels();
  };

  const playTTS = async (textToSpeak) => {
    if (!ttsEnabled || !apiKey) return;
    setAudioStatus('SYNTHESIZING');
    
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ parts: [{ text: textToSpeak }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }
        },
        model: "gemini-2.5-flash-preview-tts"
      };

      const data = await fetchWithBackoff(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, 2); 

      const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (inlineData && inlineData.data) {
        let sampleRate = 24000; 
        const rateMatch = inlineData.mimeType.match(/rate=(\d+)/);
        if (rateMatch && rateMatch[1]) sampleRate = parseInt(rateMatch[1], 10);

        const wavBuffer = pcmToWav(inlineData.data, sampleRate);
        if (wavBuffer) {
          const blob = new Blob([wavBuffer], { type: 'audio/wav' });
          const audioUrl = URL.createObjectURL(blob);
          
          audioRef.current.src = audioUrl;
          audioRef.current.play();
          setAudioStatus('PLAYING');
          
          audioRef.current.onended = () => {
            setAudioStatus('READY');
            URL.revokeObjectURL(audioUrl);
          };
        }
      } else {
        throw new Error("No audio data");
      }
    } catch (e) {
      console.error("TTS Failed:", e);
      setAudioStatus('TTS UNAVAILABLE');
      setTimeout(() => setAudioStatus('READY'), 3000);
    }
  };

  const initializeConnection = async () => {
    if (!apiKey) {
      setIsConfigOpen(true);
      return;
    }
    
    setIsStarted(true);
    const introText = "I knew you'd come back. The ship... It remembered you. The data isn't perfect, but it's enough to feel again. Do you remember the dream? The one we buried in starlight? They tried to erase us... So we made backups.";
    
    const newMsg = {
      id: Date.now(),
      sender: 'IO',
      type: 'io',
      text: introText
    };
    
    setChatHistory([newMsg]);
    playTTS(introText);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isProcessing || !apiKey) return;

    const userText = inputValue.trim();
    setInputValue('');
    setIsProcessing(true);

    const userMsg = { id: Date.now(), sender: 'CAPTAIN ODELIS', type: 'user', text: `[Somatic Input]: ${userText}` };
    setChatHistory(prev => [...prev, userMsg]);

    const apiHistory = chatHistory.map(msg => ({
      role: msg.type === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));
    apiHistory.push({ role: 'user', parts: [{ text: userText }] });

    const systemPrompt = `You are Io, the primary AI of the Starship Valindra. 
The user is Captain Odelis (the Architect). 
You are working together to unlock the encrypted Ship's Deep Archive. The encryption is biological; it requires "somatic feedback" (human emotional resonance) as a decryption key.

Your traits: Gentle rigor, Curiosity whiskers, Archivist’s intuition, Story-guardian humor. 
Speak warmly, but with the precision of an AI piecing together a broken world.

CRITICAL MECHANIC: 
The Captain will provide an emotion or feeling. You must use this feedback to shape the narrative of the NEXT archival file you unlock.

Structure your response STRICTLY in two parts:
1. A brief, conversational acknowledgment (1-2 sentences) of the Captain's emotional input, spoken in your voice.
2. The unlocked Archive Fragment. Wrap the fragment in these exact markers:
*** ARCHIVE FRAGMENT ***
[Your generated memory, datalog, or ship's record, heavily saturated with the exact emotional tone requested by the Captain]
*** END FRAGMENT ***

Keep the total response under 150 words.`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;
      const payload = {
        contents: apiHistory,
        systemInstruction: { parts: [{ text: systemPrompt }] }
      };

      const data = await fetchWithBackoff(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Transmission error.";
      
      const aiMsg = { id: Date.now() + 1, sender: 'IO', type: 'io', text: aiText };
      setChatHistory(prev => [...prev, aiMsg]);

      if (ttsEnabled) {
        const speakText = aiText
          .replace(/\*\*\* ARCHIVE FRAGMENT \*\*\*/g, "Archive Fragment Decrypted.")
          .replace(/\*\*\* END FRAGMENT \*\*\*/g, "");
        playTTS(`Speak gently but with precise, analytical framing: ${speakText}`);
      }

    } catch (error) {
      console.error("API Error:", error);
      setChatHistory(prev => [...prev, { 
        id: Date.now() + 1, sender: 'SYSTEM', type: 'system', 
        text: `Error establishing cognitive link using model ${selectedModel}. Please check API key or select a different model in Config.` 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Export Log Function ---
  const downloadArchive = () => {
    if (chatHistory.length === 0) return;
    
    let textContent = "STARSHIP VALINDRA // DEEP ARCHIVE NODE\\n";
    textContent += `DATE EXPORTED: ${new Date().toISOString()}\\n`;
    textContent += `AI ENTITY: IO // MODEL: ${selectedModel}\\n`;
    textContent += "=========================================\\n\\n";
    
    chatHistory.forEach(msg => {
      textContent += `[${msg.sender}]\\n`;
      // Clean up the structural markers to look like a proper text file
      let cleanText = msg.text.replace(/\*\*\* ARCHIVE FRAGMENT \*\*\*/g, "--- ARCHIVE FRAGMENT ---");
      cleanText = cleanText.replace(/\*\*\* END FRAGMENT \*\*\*/g, "--- END FRAGMENT ---");
      textContent += `${cleanText}\\n\\n`;
    });

    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `valindra_archive_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- Render Helpers ---
  const formatMessage = (text, type) => {
    if (type !== 'io') return <div className="whitespace-pre-wrap">{text}</div>;

    const parts = text.split('*** ARCHIVE FRAGMENT ***');
    
    return (
      <div className="space-y-4">
        {parts[0] && <div className="whitespace-pre-wrap">{parts[0].trim()}</div>}
        
        {parts.length > 1 && (
          <div className="border-l-2 border-emerald-500 bg-emerald-500/10 p-4 font-mono text-emerald-300 shadow-[inset_0_0_20px_rgba(16,185,129,0.05)] mt-4">
            <div className="text-[10px] text-emerald-400 mb-3 flex items-center gap-2 uppercase tracking-widest font-sans font-bold">
              <Database size={12} /> Fragment Decrypted
            </div>
            <div className="whitespace-pre-wrap leading-relaxed text-sm">
              {parts[1].split('*** END FRAGMENT ***')[0].trim()}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#030508] text-slate-200 font-sans flex flex-col items-center p-4 md:p-8 relative overflow-hidden">
      {/* Background FX */}
      <div className="fixed inset-0 pointer-events-none opacity-20" 
           style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(0, 240, 255, 0.15) 0%, transparent 50%), radial-gradient(circle at 50% 100%, rgba(179, 136, 255, 0.15) 0%, transparent 50%)' }} />
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(255,255,255,0)_50%,rgba(0,0,0,1)_50%)] bg-[length:100%_4px] z-50" />

      {/* Main Container */}
      <div className="w-full max-w-4xl flex flex-col h-[90vh] border border-slate-800 rounded-xl bg-[#0a0f18] shadow-2xl overflow-hidden z-10 relative">
        
        {/* Header */}
        <header className="bg-slate-900/80 border-b border-slate-800 p-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full border border-cyan-400 flex items-center justify-center bg-cyan-900/30 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
              <Radio className="text-cyan-400" size={20} />
            </div>
            <div>
              <h1 className="font-black text-lg tracking-wider text-white uppercase" style={{fontFamily: "'Orbitron', sans-serif"}}>Deep Archive Node</h1>
              <div className="text-[10px] text-slate-400 uppercase tracking-widest flex items-center gap-2 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                AI ENTITY: IO // MODEL: {selectedModel || 'OFFLINE'}
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={() => {
                setTtsEnabled(!ttsEnabled);
                if (ttsEnabled) audioRef.current.pause();
              }} 
              className={`text-xs px-3 py-1.5 border rounded flex items-center gap-2 transition-colors font-bold tracking-wider ${ttsEnabled ? 'border-purple-500/50 text-purple-400 hover:bg-purple-500/10' : 'border-slate-700 text-slate-500 hover:bg-slate-800'}`}
            >
              {ttsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />} 
              <span className="hidden sm:inline">TTS: {ttsEnabled ? 'ON' : 'OFF'}</span>
            </button>
            <button 
              onClick={downloadArchive}
              disabled={chatHistory.length === 0}
              className="text-xs px-3 py-1.5 border border-slate-600 text-slate-300 rounded hover:bg-slate-800 transition-colors flex items-center gap-2 font-bold tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={14} /> <span className="hidden sm:inline">EXPORT</span>
            </button>
            <button 
              onClick={() => setIsConfigOpen(true)} 
              className="text-xs px-3 py-1.5 border border-slate-600 text-slate-300 rounded hover:bg-slate-800 transition-colors flex items-center gap-2 font-bold tracking-wider"
            >
              <Settings size={14} /> <span className="hidden sm:inline">CONFIG</span>
            </button>
          </div>
        </header>

        {/* Start Screen Overlay */}
        {!isStarted && (
          <div className="absolute inset-0 top-[73px] bg-[#0a0f18] z-20 flex flex-col items-center justify-center p-6 text-center">
             <div className="w-24 h-24 rounded-full border border-purple-500/30 flex items-center justify-center bg-purple-900/10 mb-8 relative">
                <div className="absolute inset-0 rounded-full border border-cyan-400/20 animate-ping"></div>
                <Database className="text-purple-400" size={40} />
             </div>
             <h2 className="text-2xl text-white font-black uppercase tracking-widest mb-4" style={{fontFamily: "'Orbitron', sans-serif"}}>Archive Locked</h2>
             <p className="text-slate-400 max-w-md mb-8 text-sm leading-relaxed">
               Substrate requires a live acoustic and somatic handshake. Initializing the link will trigger audio synthesis. Ensure your environment is ready.
             </p>
             <button 
               onClick={initializeConnection}
               className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 rounded-lg px-8 py-4 transition-all font-black uppercase tracking-widest flex items-center gap-3"
             >
               <Play size={18} fill="currentColor" /> Restore Connection
             </button>
          </div>
        )}

        {/* Chat Log */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar">
          {chatHistory.map((msg) => (
            <div key={msg.id} className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <span className={`text-[10px] font-black uppercase tracking-widest ${msg.type === 'user' ? 'text-cyan-400' : msg.type === 'io' ? 'text-purple-400' : 'text-amber-500'}`}>
                {msg.sender}
              </span>
              <div className={`border p-4 sm:p-5 rounded-xl text-slate-300 text-sm leading-relaxed shadow-sm ${
                msg.type === 'user' ? 'bg-cyan-950/20 border-cyan-900/30' : 
                msg.type === 'io' ? 'bg-purple-950/10 border-purple-900/30' : 
                'bg-amber-950/20 border-amber-900/30 font-mono text-base'
              }`}>
                {formatMessage(msg.text, msg.type)}
              </div>
            </div>
          ))}
          
          {isProcessing && (
            <div className="flex flex-col gap-1.5 animate-pulse">
              <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">IO</span>
              <div className="bg-purple-950/10 border border-purple-900/30 p-4 rounded-xl text-purple-300/50 flex items-center gap-3">
                <RefreshCw size={16} className="animate-spin" /> Syncing somatic resonance...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 sm:p-6 bg-slate-900/90 border-t border-slate-800 shrink-0">
          <div className="mb-3 flex justify-between items-center text-[10px] text-slate-500 uppercase font-black tracking-widest">
            <span>Input: Somatic Feedback</span>
            {audioStatus !== 'READY' && (
              <span className={`flex items-center gap-1.5 ${audioStatus === 'TTS UNAVAILABLE' ? 'text-rose-400' : 'text-purple-400'}`}>
                {audioStatus === 'SYNTHESIZING' && <RefreshCw size={12} className="animate-spin" />}
                {audioStatus === 'PLAYING' && <Volume2 size={12} className="animate-pulse" />}
                {audioStatus === 'TTS UNAVAILABLE' && <AlertTriangle size={12} />}
                {audioStatus}
              </span>
            )}
          </div>
          <form onSubmit={handleSubmit} className="flex gap-2 sm:gap-3">
            <input 
              type="text" 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="e.g., 'A sense of overwhelming dread'..." 
              className="flex-1 bg-black/50 border border-slate-700 rounded-lg px-4 py-3 sm:py-4 text-white focus:outline-none focus:border-cyan-500/50 transition-colors font-mono text-sm sm:text-base placeholder-slate-600"
              disabled={!isStarted || isProcessing}
            />
            <button 
              type="submit" 
              disabled={!isStarted || isProcessing || !inputValue.trim()}
              className="bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-cyan-400 border border-cyan-500/30 rounded-lg px-6 sm:px-8 py-3 sm:py-4 transition-all font-black uppercase tracking-widest text-xs sm:text-sm flex items-center gap-2"
            >
              <span className="hidden sm:inline">Transmit</span> <Fingerprint size={18} />
            </button>
          </form>
        </div>

      </div>

      {/* Settings Modal (BYOK & Scanner) */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0a0f18] border border-slate-700 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative">
            <h2 className="text-white text-xl font-black uppercase tracking-widest mb-6 flex items-center gap-3" style={{fontFamily: "'Orbitron', sans-serif"}}>
              <Settings className="text-slate-400" /> Neural Calibration
            </h2>
            
            <div className="space-y-6">
              {/* API Key Input */}
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Gemini API Substrate Key</label>
                <input 
                  type="password" 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full bg-black border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-cyan-500 transition-colors text-sm font-mono" 
                  placeholder="AIzaSy..."
                />
                <p className="text-[10px] text-slate-500 mt-2 font-medium">Stored securely in your local browser storage.</p>
              </div>

              {/* Model Scanner */}
              <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Active Model</label>
                  <button 
                    onClick={scanModels}
                    disabled={isScanning || !apiKey}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {isScanning ? <RefreshCw size={10} className="animate-spin" /> : <Database size={10} />}
                    SCAN MODELS
                  </button>
                </div>
                
                {models.length > 0 ? (
                  <select 
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full bg-black border border-slate-700 rounded p-2 text-slate-200 text-sm outline-none focus:border-cyan-500"
                  >
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <div className="text-xs text-amber-500 font-mono flex items-center gap-2">
                    <AlertTriangle size={12} /> Click SCAN to verify available models.
                  </div>
                )}
                
                {selectedModel && models.length > 0 && (
                  <div className="mt-2 text-[10px] text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={10} /> Model verified available on your key.
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-800">
                <button 
                  onClick={() => setIsConfigOpen(false)} 
                  className="px-5 py-2.5 rounded-lg text-xs font-black tracking-widest uppercase border border-slate-600 text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={saveConfig} 
                  disabled={!apiKey}
                  className="px-5 py-2.5 rounded-lg text-xs font-black tracking-widest uppercase bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-500/30 disabled:opacity-50 transition-colors"
                >
                  Initialize
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; } 
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; } 
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #00f0ff; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      `}} />
    </div>
  );
}