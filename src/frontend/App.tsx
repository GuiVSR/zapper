import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

interface Message {
    id: string;
    from: string;
    fromName: string;
    body: string;
    timestamp: number;
    type: string;
    hasMedia: boolean;
    isSticker: boolean;
}

const App: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [connected, setConnected] = useState(false);
    const [sendTo, setSendTo] = useState<string>('');
    const [sendMessage, setSendMessage] = useState<string>('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<any>(null);

    useEffect(() => {
        // Connect to WebSocket server
        socketRef.current = io('http://localhost:3001');

        socketRef.current.on('connect', () => {
            console.log('Connected to server');
            setConnected(true);
        });

        socketRef.current.on('ready', (data: { message: string }) => {
            console.log(data.message);
        });

        socketRef.current.on('messages', (msgs: Message[]) => {
            setMessages(msgs);
            scrollToBottom();
        });

        socketRef.current.on('message', (msg: Message) => {
            setMessages(prev => [...prev, msg]);
            scrollToBottom();
        });

        socketRef.current.on('message_sent', (data: { success: boolean; error?: string }) => {
            if (data.success) {
                setSendMessage('');
            } else {
                console.error('Failed to send:', data.error);
            }
        });

        socketRef.current.on('disconnect', () => {
            setConnected(false);
        });

        return () => {
            socketRef.current?.disconnect();
        };
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleSendMessage = () => {
        if (sendTo && sendMessage && socketRef.current) {
            socketRef.current.emit('send_message', {
                to: sendTo,
                message: sendMessage
            });
        }
    };

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="app">
            {/* Header */}
            <div className="header">
                <h1>💬 WhatsApp Message Viewer</h1>
                <div className={`status ${connected ? 'connected' : 'disconnected'}`}>
                    {connected ? '✅ Connected' : '🔄 Connecting...'}
                </div>
            </div>

            {/* Messages Container */}
            <div className="messages-container">
                {messages.length === 0 && (
                    <div className="empty-state">
                        <div className="empty-icon">💬</div>
                        <div>No messages yet</div>
                        <div className="empty-subtitle">Messages will appear here</div>
                    </div>
                )}
                {messages.map((message) => (
                    <div key={message.id} className="message-wrapper">
                        <div className="message-header">
                            <span className="message-sender">{message.fromName}</span>
                            <span className="message-time">{formatTime(message.timestamp)}</span>
                        </div>
                        <div className="message-bubble">
                            <div className="text-message">
                                {message.body}
                            </div>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Send Message Interface */}
            {connected && (
                <div className="send-container">
                    <input
                        type="text"
                        placeholder="Phone number (with country code, e.g., 1234567890)"
                        className="send-input"
                        value={sendTo}
                        onChange={(e) => setSendTo(e.target.value)}
                    />
                    <div className="send-row">
                        <input
                            type="text"
                            placeholder="Type a message..."
                            className="message-input"
                            value={sendMessage}
                            onChange={(e) => setSendMessage(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        />
                        <button 
                            className="send-button"
                            onClick={handleSendMessage}
                            disabled={!sendTo || !sendMessage}
                        >
                            Send
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;