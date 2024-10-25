import { ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Socket } from 'node:net';

type MPVEvent = {
    event: string;
    request_id: number;
    data: any;
    error: string;
};

export class MPV {
    private socketPath: string;
    private mpvPath: string;
    private process: ChildProcess | null;
    private socket: Socket | null;
    private id: number;
    private eventEmitter: EventEmitter;

    constructor(mpvPath: string) {
        this.socketPath = process.platform === 'win32' ?
            '\\\\.\\pipe\\mpvsocket' :
            '/tmp/mpvsocket';
        this.mpvPath = mpvPath;
        this.process = null;
        this.socket = null;
        this.id = 0;
        this.eventEmitter = new EventEmitter();
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
                    this.eventEmitter.off('event', listener);
                }
            };
            this.eventEmitter.on('event', listener);
        });
    }

    private async handleEvent(data: string) {
        const event = JSON.parse(data) as MPVEvent;
        this.eventEmitter.emit('event', event);
    }

    async start() {
        const process = await this.getProcess();
        process.on('exit', () => {
            console.log('MPV process exited');
            this.process = null;
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

    async pause() {
        return this.sendCommand('set_property', 'pause', true);
    }

    async load(file: string, mode: 'replace' | 'append' | 'append-play' = 'replace') {
        return this.sendCommand('loadfile', file, mode);
    }

    async play() {
        return this.sendCommand('set_property', 'pause', false);
    }

    async getProperty(property: string) {
        return this.sendCommand('get_property', property);
    }

    async setProperty(property: string, value: any) {
        return this.sendCommand('set_property', property, value);
    }

    async fullscreen() {
        return this.sendCommand('set_property', 'fullscreen', true);
    }
}
    