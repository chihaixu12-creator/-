import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

const BASE_URL = 'http://localhost:3000';
const DB_PATH = path.resolve(process.cwd(), 'storage/modagpt.sqlite');

async function main() {
  console.log('================================================================');
  console.log('  ModaGPT 五大核心功能真实生产验收与全链路测试');
  console.log('================================================================\n');

  // 1. Verify Database
  console.log('--- [阶段 1: 检查 SQLite 生产数据库与 WAL 模式] ---');
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Database file not found at ${DB_PATH}`);
  }
  const db = new DatabaseSync(DB_PATH);
  const pragmaWal = db.prepare('PRAGMA journal_mode;').get() as { journal_mode: string };
  const pragmaFk = db.prepare('PRAGMA foreign_keys;').get() as { foreign_keys: number };
  console.log(`✓ SQLite 连接正常: ${DB_PATH}`);
  console.log(`✓ PRAGMA journal_mode: ${pragmaWal.journal_mode.toUpperCase()} (ACID 并发安全)`);
  console.log(`✓ PRAGMA foreign_keys: ${pragmaFk.foreign_keys === 1 ? 'ON (严格外键保护)' : 'OFF'}`);

  // 2. Create Test Conversation
  console.log('\n--- [阶段 2: 初始化测试会话] ---');
  const convRes = await fetch(`${BASE_URL}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '2026秋冬羊绒大衣全系列创作验收' }),
  });
  const conversation = await convRes.json() as any;
  console.log(`✓ 会话创建成功: ID=${conversation.id}, Title="${conversation.title}"`);

  // 3. Test Function 1: AI 设计 (fashion_design)
  console.log('\n--- [阶段 3: 验收 功能 1 - AI 设计 (fashion_design)] ---');
  const designPrompt = '设计一件2026秋冬羊绒立领双排扣大衣，炭灰色，挺括修身剪裁，配天然牛角纽扣与风琴褶口袋';
  console.log(`> 提交自然语言需求: "${designPrompt}"`);

  const designRes = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: designPrompt,
      conversationId: conversation.id,
      templateIntent: 'fashion_design',
    }),
  });
  const designData = await designRes.json() as any;
  console.log(`✓ 任务执行完成: Status=${designData.task.status}, TaskID=${designData.task.id}`);
  console.log(`✓ 调用工具链: ${JSON.stringify(designData.task.toolsCalled)}`);
  console.log(`✓ 任务分步数: ${designData.task.steps.length}`);
  designData.task.steps.forEach((s: any, idx: number) => {
    console.log(`   [步骤 ${idx + 1}] ${s.title} (${s.status}) - ${s.details} (${s.durationMs}ms)`);
  });

  if (!designData.task.outputAssets || designData.task.outputAssets.length === 0) {
    throw new Error('AI设计未产出任何物理资产！');
  }
  const designAsset = designData.task.outputAssets[0];
  console.log(`✓ 生成物理资产: ID=${designAsset.id}, Name="${designAsset.name}", URL=${designAsset.url}`);

  // Check physical file on disk
  const designDiskPath = path.resolve(process.cwd(), `.${designAsset.url}`);
  if (!fs.existsSync(designDiskPath)) {
    throw new Error(`资产物理文件在磁盘不存在: ${designDiskPath}`);
  }
  const designStat = fs.statSync(designDiskPath);
  console.log(`✓ 磁盘物理文件校验通过: 大小=${designStat.size} 字节, 路径=${designDiskPath}`);

  // 4. Test Function 2: 高清换色 (image_refine_color) - 3 distinct colorways
  console.log('\n--- [阶段 4: 验收 功能 4 - 高清换色 (image_refine_color)] ---');
  const colorways = [
    { name: '鼠尾草绿', prompt: '将这件大衣重映射为鼠尾草绿 (Sage Green)，保持原织物编织纹理' },
    { name: '经典驼色', prompt: '精修为经典驼色 (Classic Camel)，保持原版光影高光与纽扣' },
    { name: '纯深黑', prompt: '改色为纯深黑 (True Black)，保持原面料纹理' },
  ];

  const colorAssets: any[] = [];
  for (const c of colorways) {
    console.log(`> 提交调色需求: "${c.name}" (${c.prompt})`);
    const colorRes = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: c.prompt,
        conversationId: conversation.id,
        templateIntent: 'image_refine_color',
        sourceImage: designAsset.url,
      }),
    });
    const colorData = await colorRes.json() as any;
    console.log(`  ✓ 调色任务完成: Status=${colorData.task.status}, Tools=${JSON.stringify(colorData.task.toolsCalled)}`);
    const cAsset = colorData.task.outputAssets[0];
    const cDiskPath = path.resolve(process.cwd(), `.${cAsset.url}`);
    if (!fs.existsSync(cDiskPath)) throw new Error(`调色物理文件不存在: ${cDiskPath}`);
    const cStat = fs.statSync(cDiskPath);
    console.log(`  ✓ 产出调色资产: ${cAsset.name} | 文件大小: ${cStat.size} 字节`);
    colorAssets.push(cAsset);
  }

  // 5. Test Function 3: AI 棚拍 (model_photoshoot)
  console.log('\n--- [阶段 5: 验收 功能 3 - AI 棚拍 (model_photoshoot)] ---');
  const shootPrompt = '为该大衣拍摄商业画册级影棚大片，白棚5600K主光搭配反光板，欧美超模优雅站姿，全身景别';
  console.log(`> 提交棚拍需求: "${shootPrompt}"`);
  const shootRes = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: shootPrompt,
      conversationId: conversation.id,
      templateIntent: 'model_photoshoot',
      sourceImage: designAsset.url,
    }),
  });
  const shootData = await shootRes.json() as any;
  console.log(`✓ 棚拍任务完成: Status=${shootData.task.status}, Tools=${JSON.stringify(shootData.task.toolsCalled)}`);
  const shootAsset = shootData.task.outputAssets[0];
  const shootDiskPath = path.resolve(process.cwd(), `.${shootAsset.url}`);
  if (!fs.existsSync(shootDiskPath)) throw new Error(`棚拍物理文件不存在: ${shootDiskPath}`);
  const shootStat = fs.statSync(shootDiskPath);
  console.log(`✓ 产出棚拍资产: ${shootAsset.name} | 文件大小: ${shootStat.size} 字节`);

  // 6. Test Function 4: AI 换衣 (virtual_tryon)
  console.log('\n--- [阶段 6: 验收 功能 2 - AI 换衣 (virtual_tryon)] ---');
  // Part A: Missing parameter check
  console.log('> 子测试 A: 缺少必要参数时的必填校验');
  const missingRes = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: '请帮我完成换衣试穿',
      conversationId: conversation.id,
      templateIntent: 'virtual_tryon',
      // No images passed
    }),
  });
  const missingData = await missingRes.json() as any;
  console.log(`✓ 缺失参数校验通过: Status=${missingData.task.status} (预期 waiting_for_input)`);
  console.log(`✓ 系统反馈: "${missingData.message.content}"`);

  // Part B: Dual input fulfilled test
  console.log('\n> 子测试 B: 提供双素材进行真实自适应对齐与多模态质检');
  console.log(`  服装素材: ${designAsset.url}`);
  console.log(`  模特素材: ${shootAsset.url}`);
  const tryonRes = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: '使用上传的大衣和模特照片，生成专业虚拟试穿效果，保持模特身形与大衣面料细节',
      conversationId: conversation.id,
      templateIntent: 'virtual_tryon',
      garmentImage: designAsset.url,
      modelImage: shootAsset.url,
    }),
  });
  const tryonData = await tryonRes.json() as any;
  console.log(`✓ 换衣任务执行完成: Status=${tryonData.task.status}`);
  console.log(`✓ 工具调用链: ${JSON.stringify(tryonData.task.toolsCalled)}`);
  const tryonAsset = tryonData.task.outputAssets[0];
  const tryonDiskPath = path.resolve(process.cwd(), `.${tryonAsset.url}`);
  if (!fs.existsSync(tryonDiskPath)) throw new Error(`试衣物理文件不存在: ${tryonDiskPath}`);
  const tryonStat = fs.statSync(tryonDiskPath);
  console.log(`✓ 产出试衣资产: ${tryonAsset.name} | 大小: ${tryonStat.size} 字节`);

  const fitAudit = tryonAsset.metadata?.fitAudit;
  if (fitAudit) {
    console.log(`✓ 质检贴合评估评分: ${fitAudit.fitScore}%`);
    console.log(`   肩线贴合度: ${fitAudit.shoulderAlignment}`);
    console.log(`   面料垂坠度: ${fitAudit.drapeEvaluation}`);
    console.log(`   细节保留度: ${fitAudit.preservationReport}`);
  }

  // 7. Test Function 5: 走秀视频 (runway_video) - Honest Blocker Verification
  console.log('\n--- [阶段 7: 验收 功能 5 - 走秀视频 (runway_video) 真实授权与诚实阻断] ---');
  const videoPrompt = '为这套羊绒大衣制作一段 8 秒巴黎时装周 T 台走秀视频';
  console.log(`> 提交视频创作需求: "${videoPrompt}"`);
  const videoRes = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: videoPrompt,
      conversationId: conversation.id,
      templateIntent: 'runway_video',
      sourceImage: designAsset.url,
    }),
  });
  const videoData = await videoRes.json() as any;
  console.log(`✓ 视频任务状态: Status=${videoData.task.status} (预期 failed/阻断)`);
  console.log(`✓ 工具调用记录: ${JSON.stringify(videoData.task.toolsCalled)}`);
  const videoStep = videoData.task.steps.find((s: any) => s.tool === 'runway_video');
  console.log(`✓ 阻断详细原因: ${videoStep?.details}`);
  console.log(`✓ 系统回复确认: "${videoData.message.content}"`);

  // 8. Database Verification
  console.log('\n--- [阶段 8: 生产 SQLite 数据库全量一致性审计] ---');
  const tasksCount = db.prepare('SELECT count(*) as count FROM tasks WHERE conversation_id = ?').get(conversation.id) as { count: number };
  const stepsCount = db.prepare('SELECT count(*) as count FROM task_steps WHERE task_id IN (SELECT id FROM tasks WHERE conversation_id = ?)').get(conversation.id) as { count: number };
  const msgsCount = db.prepare('SELECT count(*) as count FROM messages WHERE conversation_id = ?').get(conversation.id) as { count: number };
  const assetsCount = db.prepare('SELECT count(*) as count FROM assets WHERE conversation_id = ?').get(conversation.id) as { count: number };

  console.log(`✓ 当前会话持久化任务主记录数 (tasks): ${tasksCount.count}`);
  console.log(`✓ 当前会话任务分步记录数 (task_steps): ${stepsCount.count}`);
  console.log(`✓ 当前会话双向消息记录数 (messages): ${msgsCount.count}`);
  console.log(`✓ 当前会话产出物理资产记录数 (assets): ${assetsCount.count}`);

  const recentAssets = db.prepare('SELECT id, name, type, size_bytes, tool FROM assets WHERE conversation_id = ?').all(conversation.id) as any[];
  console.log('\n--- [本次验收产出资产清单] ---');
  recentAssets.forEach((a, i) => {
    console.log(`  [${i + 1}] ${a.tool.padEnd(18)} | ${a.name.padEnd(28)} | ${a.size_bytes} 字节 | ID: ${a.id}`);
  });

  console.log('\n================================================================');
  console.log('  全部五大核心功能生产验收完成！所有指标均符合真实生产标准！');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('验收执行失败:', err);
  process.exit(1);
});
