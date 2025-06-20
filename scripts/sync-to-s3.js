const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

async function syncToS3() {
  try {
    const bucket = process.env.S3_BUCKET || 'rock-service-data';
    const key = process.env.S3_KEY || 'config/staging/test.json';
    const filePath = path.join(process.cwd(), 'test.json');
    
    console.log(`开始同步文件到S3: ${bucket}/${key}`);
    
    // 检查本地文件是否存在
    if (!fs.existsSync(filePath)) {
      throw new Error(`本地文件不存在: ${filePath}`);
    }
    
    // 读取文件内容
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // 上传到S3
    const putObjectCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileContent,
      ContentType: 'application/json',
      Metadata: {
        'synced-from': 'github',
        'synced-at': new Date().toISOString(),
        'commit-sha': process.env.GITHUB_SHA || 'unknown'
      }
    });
    
    await s3Client.send(putObjectCommand);
    
    console.log(`成功同步文件到S3: ${bucket}/${key}`);
    
    // 验证上传
    console.log('验证上传...');
    const { HeadObjectCommand } = require('@aws-sdk/client-s3');
    const headCommand = new HeadObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    const headResult = await s3Client.send(headCommand);
    console.log(`文件大小: ${headResult.ContentLength} bytes`);
    console.log(`最后修改时间: ${headResult.LastModified}`);
    
  } catch (error) {
    console.error('同步到S3失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  syncToS3();
}

module.exports = { syncToS3 }; 