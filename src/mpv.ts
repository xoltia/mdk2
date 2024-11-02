import { ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Socket } from 'node:net';

type MPVEvent = {
    event: string;
    request_id: number;
    data: any;
    error: string;
};

export class MPV extends EventEmitter {
    private socketPath: string;
    private mpvPath: string;
    private process: ChildProcess | null;
    private socket: Socket | null;
    private id: number;
    private screenNumber: number;

    constructor(mpvPath: string, screenNumber: number) {
        super();
        this.socketPath = process.platform === 'win32' ?
            '\\\\.\\pipe\\mpvsocket' :
            '/tmp/mpvsocket';
        this.mpvPath = mpvPath;
        this.process = null;
        this.socket = null;
        this.id = 0;
        this.screenNumber = screenNumber;
    }

    private async createSocket(): Promise<Socket> {
        return new Promise((resolve, reject) => {
            const socket = new Socket();
            let retries = 0;
            socket.on('error', (err) => {
                if (retries < 5) {
                    retries++;
                    setTimeout(() => {
                        socket.connect(this.socketPath, () => {
                            resolve(socket);
                        });
                    }, 1000);
                } else {
                    reject(err);
                }
            });
            socket.connect(this.socketPath, () => {
                resolve(socket);
            });
        });
    }

    private async createProcess(): Promise<ChildProcess> {
        return spawn(this.mpvPath, [
            '--idle',
            '--force-window',
            '--fs',
            '--fs-screen=' + this.screenNumber,
            '--input-ipc-server=' + this.socketPath,
        ]);
    }

    private async getSocket(): Promise<Socket> {
        if (!this.socket) {
            this.socket = await this.createSocket();
        }
        return this.socket;
    }

    private async getProcess(): Promise<ChildProcess> {
        if (!this.process) {
            this.process = await this.createProcess();
        }
        return this.process;
    }

    private async sendCommand(command: string, ...args: any[]): Promise<any> {
        const socket = await this.getSocket();
        return new Promise((resolve, reject) => {
            const id = this.id++;
            const data = JSON.stringify({ command: [command, ...args], request_id: id });
            socket.write(data + '\n');
            const listener = (event: MPVEvent) => {
                if (event.request_id === id) {
                    if (event.error !== 'success') {
                        reject(event.error);
                    } else {
                        resolve(event.data);
                    }
                    this.off('event', listener);
                }
            };
            this.on('event', listener);
        });
    }

    private async handleEvent(data: string) {
        const event = JSON.parse(data) as MPVEvent;
        this.emit('event', event);
    }

    async start() {
        const process = await this.getProcess();
        process.on('exit', () => {
            this.process = null;
            this.socket = null;
            this.emit('exit');
        });
        const socket = await this.getSocket();
        let buffer = '';
        socket.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                this.handleEvent(line);
            }
        });
    }

    pause() {
        return this.setProperty('pause', true);
    }

    load(file: string, mode: 'replace' | 'append' | 'append-play' = 'replace') {
        return this.sendCommand('loadfile', file, mode);
    }

    play() {
        return this.setProperty('pause', false);
    }

    getProperty(property: string) {
        return this.sendCommand('get_property', property);
    }

    setProperty(property: string, value: any) {
        return this.sendCommand('set_property', property, value);
    }

    fullscreen() {
        return this.sendCommand('set_property', 'fullscreen', true);
    }

    osdMessage(text: string) {
        return this.sendCommand('show_text', text);
    }
}
    