const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Раздаем статические файлы из папки "public". 
// HTML файл виджета должен лежать в папке public под именем index.html
app.use(express.static(path.join(__dirname, 'public')));

wss.on('connection', (ws) => {
    let tiktokConnection = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // Виджет присылает сообщение set_user с юзернеймом
            if (data.type === 'set_user') {
                const username = data.username;
                console.log(`Клиент запросил подключение к стримеру: ${username}`);
                
                // Если уже было подключение на этом сокете, закрываем его
                if (tiktokConnection) {
                    tiktokConnection.disconnect();
                }

                // Создаем подключение к TikTok
                tiktokConnection = new WebcastPushConnection(username);

                tiktokConnection.connect().then(state => {
                    console.info(`[${username}] Успешно подключено к стриму!`);
                    ws.send(JSON.stringify({ type: 'connected', roomId: state.roomId }));
                }).catch(err => {
                    console.error(`[${username}] Ошибка подключения:`, err.message);
                    ws.send(JSON.stringify({ type: 'error', message: 'Не удалось подключиться к стриму. Возможно, он оффлайн или неверный юзернейм.' }));
                });

                // Слушаем подарки
                tiktokConnection.on('gift', data => {
                    // Проверяем, что подарок завершен (если это комбо-подарок, типа роз)
                    // Отправляем только когда комбо закончилось, либо если это одиночный дорогой подарок
                    if (data.giftType === 1 && !data.repeatEnd) {
                        return; // Ждем окончания комбо
                    }
                    
                    console.log(`[${username}] Подарок: ${data.giftName} от ${data.nickname} (Монет: ${data.diamondCount})`);
                    
                    // Пересылаем подарок обратно виджету
                    ws.send(JSON.stringify({
                        type: 'gift',
                        nickname: data.nickname,
                        diamondCount: data.diamondCount
                    }));
                });
                
                // Если стрим закончился
                tiktokConnection.on('streamEnd', () => {
                    console.log(`[${username}] Стрим завершен`);
                    ws.send(JSON.stringify({ type: 'error', message: 'Стрим завершен' }));
                });
            }
        } catch (e) {
            console.error('Ошибка обработки сообщения WebSocket:', e);
        }
    });

    // Очистка при отключении виджета (например, если закрыли OBS)
    ws.on('close', () => {
        console.log('Виджет отключился');
        if (tiktokConnection) {
            tiktokConnection.disconnect();
        }
    });
});

// Railway использует динамический порт через process.env.PORT
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`Если вы запускаете локально, откройте: http://localhost:${PORT}/?user=ВАШ_ЮЗЕРНЕЙМ`);
});
