import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {availableParallelism,constants,freemem,totalmem} from 'node:os';
const started=Date.now();
const files={memoryCurrent:'/sys/fs/cgroup/memory.current',memoryMax:'/sys/fs/cgroup/memory.max',memoryEvents:'/sys/fs/cgroup/memory.events',cpuMax:'/sys/fs/cgroup/cpu.max',cpuStat:'/sys/fs/cgroup/cpu.stat'};
async function procMetadata(){
 const result={};
 for(const [key,path] of Object.entries({memory:'/proc/meminfo',memoryPressure:'/proc/pressure/memory',cpuPressure:'/proc/pressure/cpu',self:'/proc/self/status'})){
  try{const value=await readFile(path,'utf8');result[key]=(key==='memory'?value.split('\n').filter(line=>/^(MemTotal|MemFree|MemAvailable|SwapTotal|SwapFree|Committed_AS):/.test(line)).join(' '):key==='self'?value.split('\n').filter(line=>/^(State|VmPeak|VmSize|VmHWM|VmRSS|RssAnon|Threads):/.test(line)).join(' '):value).trim().replace(/\s+/g,' ').slice(0,1024)}catch{result[key]=null}
 }
 return result;
}
async function report(phase,extra={}){
 const cgroup=Object.fromEntries(await Promise.all(Object.entries(files).map(async([key,path])=>{
  try{return [key,(await readFile(path,'utf8')).trim().replace(/\s+/g,' ').slice(0,512)]}catch{return [key,null]}
 })));
 console.log('[build-diagnostics] '+JSON.stringify({phase,elapsedSeconds:Math.round((Date.now()-started)/1000),node:process.version,platform:process.platform,architecture:process.arch,availableCpus:availableParallelism(),wrapperRssBytes:process.memoryUsage().rss,systemMemoryBytes:{total:totalmem(),free:freemem()},proc:await procMetadata(),cgroup,...extra}));
}
await report('start');
const command=process.argv[2]??'pnpm';const args=process.argv.length>2?process.argv.slice(3):['build'];
const child=spawn(command,args,{stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
let requestedSignal;
const terminate=signal=>{requestedSignal=signal;child.kill(signal)};
process.on('SIGINT',terminate);process.on('SIGTERM',terminate);
const timer=setInterval(()=>void report('progress'),15000);timer.unref();
const result=await new Promise(resolve=>{
 child.once('error',error=>resolve({exitCode:1,signal:null,launchErrorCode:error.code}));
 child.once('exit',(exitCode,signal)=>resolve({exitCode,signal}));
});
clearInterval(timer);process.off('SIGINT',terminate);process.off('SIGTERM',terminate);
await report('exit',result);
const signal=requestedSignal??result.signal;
process.exitCode=signal?128+(constants.signals[signal]??1):result.exitCode??1;
