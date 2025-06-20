const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const FileManager = require('../utils/file-manager');
const crypto = require('crypto');

const s3Client = new S3Client({ 
  region: process.env.AWS_REGION || 'ap-southeast-2'
});

async function syncToS3Production() {
  try {
    const fileManager = new FileManager();
    const bucket = process.env.S3_BUCKET || 'rock-service-data';
    const environment = 'production';
    const syncSource = process.env.SYNC_SOURCE || 'github-main';
    
    console.log(`🚀 开始同步多文件到生产环境S3: ${bucket}`);
    console.log(`📁 环境: ${environment}`);
    console.log(`🌍 区域: ${process.env.AWS_REGION || 'ap-southeast-2'}`);
    console.log(`🔄 同步来源: ${syncSource}`);
    console.log('');
    
    const files = fileManager.getFiles();
    const results = {
      success: [],
      failed: []
    };
    
    for (const file of files) {
      const fileName = file.name;
      const shortName = fileManager.getFileName(fileName);
      const s3Key = file.production_path;
      
      try {
        console.log(`📄 处理文件: ${shortName}`);
        console.log(`   📂 本地路径: ${fileName}`);
        console.log(`   ☁️  S3路径: ${s3Key}`);
        
        // 检查本地文件是否存在
        if (!fileManager.fileExists(fileName)) {
          console.log(`   ⚠️  本地文件不存在，跳过: ${fileName}`);
          results.failed.push({
            file: shortName,
            error: '本地文件不存在'
          });
          continue;
        }
        
        // 读取文件内容
        const fileContent = fileManager.readFile(fileName);
        
        // 计算文件哈希
        const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');
        
        // 上传到S3生产环境
        const putObjectCommand = new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: fileContent,
          ContentType: 'application/json',
          Metadata: {
            'synced-from': syncSource,
            'synced-at': new Date().toISOString(),
            'commit-sha': process.env.GITHUB_SHA || 'unknown',
            'environment': environment,
            'file-hash': fileHash,
            'source-file': fileName,
            'sync-direction': 'github-to-s3'
          }
        });
        
        await s3Client.send(putObjectCommand);
        
        console.log(`   ✅ 成功同步: ${shortName}`);
        results.success.push({
          file: shortName,
          s3Key: s3Key,
          hash: fileHash
        });
        
      } catch (error) {
        console.error(`   ❌ 同步失败: ${shortName}`, error.message);
        results.failed.push({
          file: shortName,
          error: error.message
        });
      }
      
      console.log('');
    }
    
    // 输出同步结果
    console.log('📊 同步结果汇总:');
    console.log('================');
    console.log(`✅ 成功: ${results.success.length} 个文件`);
    console.log(`❌ 失败: ${results.failed.length} 个文件`);
    
    if (results.success.length > 0) {
      console.log('\n✅ 成功同步的文件:');
      results.success.forEach(result => {
        console.log(`   📄 ${result.file} → ${result.s3Key}`);
      });
    }
    
    if (results.failed.length > 0) {
      console.log('\n❌ 同步失败的文件:');
      results.failed.forEach(result => {
        console.log(`   📄 ${result.file}: ${result.error}`);
      });
    }
    
    // 验证上传
    console.log('\n🔍 验证生产环境S3文件:');
    console.log('======================');
    try {
      const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'config/production/'
      });
      
      const listResult = await s3Client.send(listCommand);
      if (listResult.Contents) {
        listResult.Contents.forEach(obj => {
          console.log(`   📄 ${obj.Key} (${obj.Size} bytes)`);
        });
      }
    } catch (error) {
      console.error('   ⚠️  验证失败:', error.message);
    }
    
    console.log('\n🚀 生产环境多文件同步完成！');
    console.log('🔄 同步方向: GitHub → S3 (单向，避免循环同步)');
    
    // 如果有失败的文件，返回错误状态
    if (results.failed.length > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ 生产环境多文件同步失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  syncToS3Production();
}

module.exports = { syncToS3Production }; 