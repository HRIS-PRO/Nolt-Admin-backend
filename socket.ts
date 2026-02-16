import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: Server;

export const initSocket = (httpServer: HttpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: "*", // Allow all for development/testing
            methods: ["GET", "POST", "PATCH", "DELETE"],
            credentials: true
        }
    });

    io.on('connection', (socket: Socket) => {
        console.log('New client connected:', socket.id);

        // Join a room based on loan ID for specific updates (optional for now, good for details page)
        socket.on('join_loan', (loanId) => {
            socket.join(`loan_${loanId}`);
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error("Socket.io not initialized!");
    }
    return io;
};
