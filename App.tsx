
import React from 'react';
import ChatView from './components/ChatView';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex items-center justify-center overflow-hidden">
      <ChatView />
    </div>
  );
};

export default App;
