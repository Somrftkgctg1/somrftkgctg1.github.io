const WebSocket = require('ws');
const bcrypt = require('bcrypt');
const http = require('http');
const express = require('express');

// Настройка Express для обработки HTTP-запросов (необходим для Render)
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const chats = {}; // Хранит сообщения для каждого chatCode
const users = {}; // Хранит пользователей: { nickname: passwordHash }
const SALT_ROUNDS = 10; // Количество раундов для bcrypt

// Простая главная страница для проверки работоспособности
app.get('/', (req, res) => {
    res.send('WebSocket server is running');
});

// WebSocket логика
wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'register') {
                const { nickname, password } = data;
                if (users[nickname]) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Этот ник уже занят.' }));
                    return;
                }
                if (!nickname || nickname.length < 1 || nickname.length > 20) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Ник должен быть от 1 до 20 символов.' }));
                    return;
                }
                if (password.length < 6 || password.length > 50) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Пароль должен быть от 6 до 50 символов.' }));
                    return;
                }
                // Хэширование пароля с помощью bcrypt
                const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
                users[nickname] = passwordHash;
                ws.send(JSON.stringify({ type: 'register_success', nickname }));
            }

            if (data.type === 'login') {
                const { nickname, password } = data;
                if (!users[nickname] || !(await bcrypt.compare(password, users[nickname]))) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Неверный ник или пароль.' }));
                    return;
                }
                ws.send(JSON.stringify({ type: 'login_success', nickname }));
            }

            if (data.type === 'join') {
                const { chatCode, nickname } = data;
                if (chatCode !== '123456') {
                    ws.send(JSON.stringify({ type: 'error', message: 'Неверный код.' }));
                    return;
                }
                if (!chats[chatCode]) chats[chatCode] = [];
                ws.chatCode = chatCode;
                ws.nickname = nickname;
                ws.send(JSON.stringify({ type: 'messages', messages: chats[chatCode] }));
                chats[chatCode].push({ text: `Добро пожаловать в чат с кодом ${chatCode}!`, sender: 'received', user: 'System' });
                broadcast(chatCode, { type: 'messages', messages: chats[chatCode] });
            }

            if (data.type === 'message') {
                const { chatCode, nickname, text } = data;
                if (!chats[chatCode]) chats[chatCode] = [];
                chats[chatCode].push({ text, sender: 'sent', user: nickname });
                broadcast(chatCode, { type: 'messages', messages: chats[chatCode] });
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({ type: 'error', message: 'Ошибка сервера.' }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

function broadcast(chatCode, message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.chatCode === chatCode) {
            client.send(JSON.stringify(message));
        }
    });
}

// Запуск сервера
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
