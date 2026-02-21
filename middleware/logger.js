import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logFilePath = path.join(__dirname, '../logs_auditoria.txt');

export function auditarAcao(req, res, next) {
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        const agora = new Date().toISOString();
        const usuarioRef = req.usuario ? req.usuario.id : 'Anônimo';
        const msg = `[${agora}] LOG_TRILHA_AUDITORIA: User: ${usuarioRef} | Método: ${req.method} | Rota: ${req.originalUrl} | IP: ${req.ip}\n`;

        fs.appendFile(logFilePath, msg, (err) => {
            if (err) console.error('Erro ao escrever log:', err);
        });
    }
    next();
}
