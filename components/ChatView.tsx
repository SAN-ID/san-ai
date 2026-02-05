
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { generateAIResponse, generateTTS } from '../services/geminiService';
import { Icons } from '../constants';

const CodeBlock: React.FC<{ language: string; code: string; onCopy: () => void; isCopied: boolean }> = ({ language, code, onCopy, isCopied }) => {
  return (
    <div className="code-box">
      <div className="code-header">
        <span className="text-[10px] font-bold text-zinc-500 font-mono uppercase tracking-wider">{language || 'code'}</span>
        <button onClick={onCopy} className="copy-btn">
          {isCopied ? <Icons.Check /> : <Icons.Copy />}
          <span>{isCopied ? 'TERSALIN' : 'SALIN SEMUA'}</span>
        </button>
      </div>
      <div className="code-content scrollbar-premium">
        <pre className="text-blue-300 whitespace-pre"><code className="font-mono">{code}</code></pre>
      </div>
    </div>
  );
};

const ChatView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioSource = useRef<AudioBufferSourceNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('san_ai_data');
    if (saved) setMessages(JSON.parse(saved));
  }, []);

  useEffect(() => {
    if (messages.length > 0) localStorage.setItem('san_ai_data', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, isGeneratingImage]);

  const speak = async (text: string) => {
    if (!text || !ttsEnabled) return;
    
    // Hentikan suara lama jika ada suara baru yang masuk
    if (currentAudioSource.current) {
      try {
        currentAudioSource.current.stop();
      } catch(e) {}
      currentAudioSource.current = null;
    }

    setIsSpeaking(true);
    try {
      const base64Audio = await generateTTS(text);
      if (base64Audio) {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') await ctx.resume();

        const binary = atob(base64Audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const dataInt16 = new Int16Array(bytes.buffer);
        const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => {
          if (currentAudioSource.current === source) setIsSpeaking(false);
        };
        currentAudioSource.current = source;
        source.start();
      } else {
        setIsSpeaking(false);
      }
    } catch (e) {
      setIsSpeaking(false);
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if ((!trimmed && !attachedImage) || loading || isGeneratingImage) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: trimmed,
      imageUrl: attachedImage || undefined,
      timestamp: Date.now()
    };

    setMessages(p => [...p, userMsg]);
    const currentInput = trimmed;
    const currentImage = attachedImage;
    
    setInput('');
    setAttachedImage(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const lowerInput = currentInput.toLowerCase();
    const isImageReq = ['/img', '/foto', '/gambar', 'buatkan gambar'].some(t => lowerInput.includes(t)) && !currentImage;

    if (isImageReq) setIsGeneratingImage(true);
    else setLoading(true);

    try {
      if (isImageReq) {
        let prompt = currentInput.replace(/\/(img|foto|gambar)/gi, '').trim() || "Pemandangan indah";
        const seed = Math.floor(Math.random() * 999999);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&seed=${seed}&nologo=true&width=1024&height=1024`;
        await new Promise(r => setTimeout(r, 3500));
        const modelMsg: ChatMessage = {
          id: Date.now().toString() + 'ai',
          role: 'model',
          text: `Ini adalah gambar untuk: **${prompt}**`,
          imageUrl: imageUrl,
          timestamp: Date.now()
        };
        setMessages(p => [...p, modelMsg]);
        speak(modelMsg.text);
      } else {
        const response = await generateAIResponse(currentInput || "Halo", currentImage || undefined);
        const modelMsg: ChatMessage = { id: Date.now().toString() + 'ai', role: 'model', text: response, timestamp: Date.now() };
        setMessages(p => [...p, modelMsg]);
        speak(modelMsg.text);
      }
    } catch (err) {
      setMessages(p => [...p, { id: Date.now().toString() + 'err', role: 'model', text: "Maaf, koneksi terputus.", timestamp: Date.now() }]);
    } finally {
      setLoading(false);
      setIsGeneratingImage(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyStatus(id);
      setTimeout(() => setCopyStatus(null), 2000);
    });
  };

  const parseContent = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*|`.*?`|```[\w\-]*\n[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith('```')) {
        const lines = part.split('\n');
        const lang = (lines[0].match(/```(\w+)/) || [])[1] || 'code';
        const cleanCode = lines.slice(1, -1).join('\n');
        const cid = `code-${i}`;
        return <CodeBlock key={i} language={lang} code={cleanCode} onCopy={() => copyToClipboard(cleanCode, cid)} isCopied={copyStatus === cid} />;
      }
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="text-white font-bold">{part.slice(2, -2)}</strong>;
      if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="bg-zinc-800 px-1.5 py-0.5 rounded text-blue-300 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
      return <span key={i} className="text-zinc-300">{part}</span>;
    });
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#0b0b0d] relative overflow-hidden">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-6 border-b border-white/5 bg-[#0b0b0d]/80 backdrop-blur-md z-50">
         <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center font-black text-xs">S</div>
            <h1 className="text-sm font-bold text-white tracking-tight">San AI</h1>
         </div>
         <div className="flex items-center gap-4">
           {isSpeaking && (
             <div className="voice-wave">
               <div className="bar"></div>
               <div className="bar" style={{animationDelay: '0.2s'}}></div>
               <div className="bar" style={{animationDelay: '0.1s'}}></div>
             </div>
           )}
           <button 
              onClick={() => {
                setTtsEnabled(!ttsEnabled);
                if (isSpeaking && ttsEnabled) {
                  currentAudioSource.current?.stop();
                  setIsSpeaking(false);
                }
              }}
              className={`p-2 rounded-full transition-all ${ttsEnabled ? 'bg-blue-600' : 'bg-zinc-900 border border-white/5'}`}
            >
              <Icons.Microphone active={ttsEnabled} />
           </button>
         </div>
      </div>

      {/* Main Chat Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-premium pt-6 pb-40">
        <div className="message-container">
          {messages.length === 0 && (
            <div className="h-[60vh] flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 bg-zinc-900 border border-white/5 rounded-2xl flex items-center justify-center mb-4">
                <span className="text-2xl font-black text-blue-500 italic">S</span>
              </div>
              <h2 className="text-lg font-bold text-white mb-1">San AI Siap Membantu</h2>
              <p className="text-zinc-500 text-[11px] max-w-[200px] leading-relaxed">Tanyakan apa saja atau kirim foto untuk dianalisis.</p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className="w-full">
              {msg.role === 'user' ? (
                <div className="flex flex-col items-end mb-6">
                  {msg.imageUrl && (
                    <img 
                      src={msg.imageUrl} 
                      className="chat-image-square mb-2 shadow-lg ring-1 ring-white/10" 
                      alt="Input User" 
                      onClick={() => setLightboxImage(msg.imageUrl!)} 
                    />
                  )}
                  {msg.text && <div className="user-message">{msg.text}</div>}
                </div>
              ) : (
                <div className="ai-message-wrapper">
                  <div className="ai-avatar">S</div>
                  <div className="flex-1 min-w-0">
                    <div className="whitespace-pre-wrap text-[14px]">{parseContent(msg.text)}</div>
                    {msg.imageUrl && (
                      <img 
                        src={msg.imageUrl} 
                        className="chat-image-square mt-3 shadow-xl" 
                        alt="Output AI" 
                        onClick={() => setLightboxImage(msg.imageUrl!)} 
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {(loading || isGeneratingImage) && (
            <div className="ai-message-wrapper">
              <div className="ai-avatar">S</div>
              <div className="flex flex-col gap-1">
                <div className="typing-dots"><div className="dot" /><div className="dot" /><div className="dot" /></div>
                {isGeneratingImage && <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest animate-pulse">Membuat Gambar...</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input Field */}
      <div className="absolute bottom-0 left-0 right-0 input-blur pb-6 pt-4 px-4 z-40">
        <div className="message-container">
          {attachedImage && (
            <div className="flex items-center gap-2 p-1.5 bg-zinc-900/95 border border-white/10 rounded-xl w-fit mb-2 animate-in slide-in-from-bottom-2 shadow-xl backdrop-blur-xl">
              <div className="relative">
                <img src={attachedImage} className="w-10 h-10 object-cover rounded-lg" />
                <button onClick={() => setAttachedImage(null)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[8px] font-bold">×</button>
              </div>
              <span className="text-[9px] font-bold text-blue-400 uppercase pr-2">Foto Siap</span>
            </div>
          )}
          <div className="input-bar flex items-end p-2 px-3">
            <button onClick={() => fileInputRef.current?.click()} className="mb-1 w-9 h-9 rounded-xl flex items-center justify-center text-zinc-500 hover:text-white transition-all">
              <Icons.Image />
            </button>
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (textareaRef.current) {
                  textareaRef.current.style.height = 'auto';
                  textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
                }
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Tulis pesan..."
              className="flex-1 bg-transparent text-white focus:outline-none resize-none py-2.5 px-3 text-[14px] placeholder-zinc-700"
            />
            <button
              onClick={handleSend}
              disabled={(!input.trim() && !attachedImage) || loading || isGeneratingImage}
              className={`mb-1 w-9 h-9 rounded-full flex items-center justify-center transition-all ${(!input.trim() && !attachedImage) || loading || isGeneratingImage ? 'bg-zinc-800 text-zinc-600' : 'bg-white text-black hover:bg-zinc-200'}`}
            >
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
            </button>
          </div>
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              const r = new FileReader();
              r.onloadend = () => setAttachedImage(r.result as string);
              r.readAsDataURL(f);
            }
          }} />
        </div>
      </div>

      {lightboxImage && (
        <div className="fixed inset-0 z-[100] bg-black/98 flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in" onClick={() => setLightboxImage(null)}>
          <img src={lightboxImage} className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" alt="Preview Full" />
        </div>
      )}
    </div>
  );
};

export default ChatView;
