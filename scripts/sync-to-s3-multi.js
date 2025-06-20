const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const FileManager = require('../utils/file-manager');

const s3Client = new S3Client({ 
  region: process.env.AWS_REGION || 'ap-southeast-2'
});

async function syncToS3Multi(environment = 'staging') {
  const fileManager = new FileManager();
  const bucket = process.env.S3_BUCKET || 'rock-service-data';
  
  console.log(`🚀 开始同步文件到S3 ${environment}环境...`);
  console.log(`使用区域: ${process.env.AWS_REGION || 'ap-southeast-2'}`);
  
  const files = fileManager.getFiles();
  const results = {
    success: [],
    failed: [],
    skipped: []
  };

  for (const file of files) {
    const fileName = file.name;
    
    try {
      // 检查本地文件是否存在
      if (!fileManager.fileExists(fileName)) {
        console.log(`⚠️  跳过 ${fileName}: 本地文件不存在`);
        results.skipped.push({ fileName, reason: '本地文件不存在' });
        continue;
      }

      // 验证JSON格式
      if (!fileManager.validateJsonFile(fileName)) {
        console.log(`❌ 跳过 ${fileName}: JSON格式无效`);
        results.failed.push({ fileName, reason: 'JSON格式无效' });
        continue;
      }

      // 获取S3路径
      const s3Key = fileManager.getFilePath(fileName, environment);
      const fileContent = fileManager.readFile(fileName);
      const fileHash = fileManager.getFileHash(fileName);

      // 检查S3上文件是否已存在且内容相同
      let s3Hash = null;
      try {
        const headCommand = new HeadObjectCommand({
          Bucket: bucket,
          Key: s3Key
        });
        const headResult = await s3Client.send(headCommand);
        s3Hash = headResult.Metadata?.['file-hash'];
      } catch (error) {
        // 文件不存在，继续上传
      }

      // 如果内容相同，跳过
      if (s3Hash === fileHash) {
        console.log(`⏭️  跳过 ${fileName}: 内容未变化`);
        results.skipped.push({ fileName, reason: '内容未变化' });
        continue;
      }

      // 上传到S3
      const putObjectCommand = new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: fileContent,
        ContentType: 'application/json',
        Metadata: {
          'synced-from': 'github',
          'synced-at': new Date().toISOString(),
          'commit-sha': process.env.GITHUB_SHA || 'unknown',
          'environment': environment,
          'file-hash': fileHash,
          'file-name': fileName
        }
      });

      await s3Client.send(putObjectCommand);
      
      console.log(`✅ 成功同步 ${fileName} 到 ${bucket}/${s3Key}`);
      results.success.push({ 
        fileName, 
        s3Key, 
        size: fileContent.length,
        hash: fileHash 
      });

    } catch (error) {
      console.error(`❌ 同步 ${fileName} 失败:`, error.message);
      results.failed.push({ fileName, reason: error.message });
    }
  }

  // 输出同步结果
  console.log('\n📊 同步结果汇总:');
  console.log(`✅ 成功: ${results.success.length} 个文件`);
  console.log(`❌ 失败: ${results.failed.length} 个文件`);
  console.log(`⏭️  跳过: ${results.skipped.length} 个文件`);

  if (results.success.length > 0) {
    console.log('\n✅ 成功同步的文件:');
    results.success.forEach(result => {
      console.log(`  - ${result.fileName} → ${result.s3Key} (${result.size} bytes)`);
    });
  }

  if (results.failed.length > 0) {
    console.log('\n❌ 同步失败的文件:');
    results.failed.forEach(result => {
      console.log(`  - ${result.fileName}: ${result.reason}`);
    });
  }

  if (results.skipped.length > 0) {
    console.log('\n⏭️  跳过的文件:');
    results.skipped.forEach(result => {
      console.log(`  - ${result.fileName}: ${result.reason}`);
    });
  }

  // 如果有失败的文件，退出码为1
  if (results.failed.length > 0) {
    process.exit(1);
  }

  console.log(`\n🎉 ${environment}环境同步完成！`);
}

// 如果直接运行此脚本
if (require.main === module) {
  const environment = process.argv[2] || 'staging';
  syncToS3Multi(environment);
}

module.exports = { syncToS3Multi }; 