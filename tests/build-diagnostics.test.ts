import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';

test('build diagnostics preserve the real build failure exit code',()=>{
 const result=spawnSync(process.execPath,['scripts/build-with-diagnostics.mjs',process.execPath,'-e','process.exit(13)'],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,13);
});
test('build diagnostics report bounded resource metadata without dumping private environment values',()=>{
 const marker='private-build-probe-do-not-log';
 const result=spawnSync(process.execPath,['scripts/build-with-diagnostics.mjs',process.execPath,'-e','process.stdout.write("child-ok\\n")'],{encoding:'utf8',timeout:10000,env:{...process.env,BUILD_PRIVATE_PROBE:marker}});
 assert.equal(result.status,0);
 const diagnostics=result.stdout.split('\n').filter(line=>line.startsWith('[build-diagnostics] ')).map(line=>JSON.parse(line.slice('[build-diagnostics] '.length)));
 assert.ok(diagnostics.some(row=>row.phase==='start'));
 assert.ok(diagnostics.some(row=>row.phase==='exit'&&row.exitCode===0));
 assert.ok(!result.stdout.includes(marker)&&!result.stderr.includes(marker));
});

test('a build killed by a signal remains a failed build',()=>{
 const result=spawnSync(process.execPath,['scripts/build-with-diagnostics.mjs',process.execPath,'-e','process.kill(process.pid,"SIGTERM")'],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,143);
});
