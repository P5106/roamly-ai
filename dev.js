import { spawn } from 'node:child_process';
import process from 'node:process';
const children=[];
function start(label,args){const child=spawn(process.execPath,args,{stdio:'inherit',env:process.env});children.push(child);child.on('exit',code=>{if(code&&code!==0)console.error(`${label} exited with code ${code}`);});}
start('Roamly API',['server.js']);
const viteBin=process.platform==='win32'?'node_modules/vite/bin/vite.js':'node_modules/vite/bin/vite.js';
start('Vite',[viteBin,'--host','0.0.0.0']);
function stop(){for(const child of children)child.kill('SIGTERM');process.exit(0)}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
