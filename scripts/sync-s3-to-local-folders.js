const { S3Client, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const FolderManager = require('../utils/folder-manager');
const crypto = require('crypto');

const s3Client = new S3Client({ 
  region: process.env.AWS_REGION || 'ap-southeast-2'
});

async function syncS3ToLocalFolders() {
  try {
    const folderManager = new FolderManager();
    const bucket = process.env.S3_BUCKET || 'rock-service-data';
    const environment = process.env.ENVIRONMENT || 'staging';
    
    console.log(`🚀 开始从S3同步到本地文件夹: ${bucket}`);
    console.log(`📁 环境: ${environment}`);
    console.log(`🌍 区域: ${process.env.AWS_REGION || 'ap-southeast-2'}`);
    console.log('');
    
    const folders = folderManager.getFolders();
    const results = {
      success: [],
      failed: [],
      skipped: []
    };
    
    for (const folder of folders) {
      console.log(`📁 处理文件夹: ${folder.name} (${folder.description})`);
      console.log(`   📂 本地路径: ${folder.local_path}`);
      console.log(`   ☁️  S3前缀: ${folder.s3_prefix}`);
      console.log('');
      
      for (const file of folder.files) {
        const fileName = file.name;
        const s3Key = `${folder.s3_prefix}/${environment}/${fileName}`;
        
        try {
          console.log(`   📄 检查文件: ${fileName}`);
          console.log(`      ☁️  S3路径: ${s3Key}`);
          console.log(`      📂 本地路径: ${folder.local_path}/${fileName}`);
          
          // 检查S3文件是否存在
          let s3Exists = false;
          let s3Hash = null;
          let s3Content = null;
          
          try {
            const headCommand = new GetObjectCommand({
              Bucket: bucket,
              Key: s3Key
            });
            const s3Response = await s3Client.send(headCommand);
            s3Exists = true;
            s3Hash = s3Response.Metadata?.['file-hash'];
            s3Content = await streamToString(s3Response.Body);
            console.log(`      ☁️  S3文件存在，哈希: ${s3Hash ? s3Hash.substring(0, 8) + '...' : '无'}`);
          } catch (error) {
            if (error.name === 'NotFound') {
              console.log(`      ☁️  S3文件不存在，跳过`);
              results.skipped.push({
                folder: folder.name,
                file: fileName,
                reason: 'S3文件不存在'
              });
              continue;
            } else {
              throw error;
            }
          }
          
          // 检查本地文件是否存在及其哈希
          let localHash = null;
          let localExists = false;
          
          try {
            if (folderManager.fileExists(folder.name, fileName)) {
              localExists = true;
              localHash = folderManager.getFileHash(folder.name, fileName);
              console.log(`      📂 本地文件存在，哈希: ${localHash.substring(0, 8) + '...'}`);
            }
          } catch (error) {
            console.log(`      📂 本地文件不存在`);
          }
          
          // 计算S3文件的哈希
          const s3ContentHash = crypto.createHash('sha256').update(s3Content).digest('hex');
          
          // 比较哈希，判断是否需要同步
          if (localExists && localHash === s3ContentHash) {
            console.log(`      ⏭️  文件未变更，跳过同步`);
            results.skipped.push({
              folder: folder.name,
              file: fileName,
              reason: '文件未变更',
              hash: s3ContentHash.substring(0, 8) + '...'
            });
            continue;
          }
          
          // 确保本地文件夹存在
          const folderPath = folder.local_path;
          const fullFolderPath = require('path').join(process.cwd(), folderPath);
          if (!require('fs').existsSync(fullFolderPath)) {
            require('fs').mkdirSync(fullFolderPath, { recursive: true });
            console.log(`      📁 创建本地文件夹: ${folderPath}`);
          }
          
          // 写入本地文件
          folderManager.writeFile(folder.name, fileName, s3Content);
          
          console.log(`      ✅ 成功同步: ${fileName}`);
          results.success.push({
            folder: folder.name,
            file: fileName,
            localPath: `${folder.local_path}/${fileName}`,
            hash: s3ContentHash.substring(0, 8) + '...',
            changed: localExists ? '是' : '新增'
          });
          
          // 验证JSON格式
          if (folderManager.validateJsonFile(folder.name, fileName)) {
            console.log(`      ✅ JSON格式验证通过`);
          } else {
            console.log(`      ⚠️  JSON格式验证失败`);
          }
          
        } catch (error) {
          console.error(`      ❌ 同步失败: ${fileName}`, error.message);
          results.failed.push({
            folder: folder.name,
            file: fileName,
            error: error.message
          });
        }
        
        console.log('');
      }
      
      console.log(`📁 文件夹 ${folder.name} 处理完成\n`);
    }
    
    // 输出同步结果
    console.log('📊 从S3到本地文件夹的同步结果汇总:');
    console.log('==================================');
    console.log(`✅ 成功: ${results.success.length} 个文件`);
    console.log(`❌ 失败: ${results.failed.length} 个文件`);
    console.log(`⏭️  跳过: ${results.skipped.length} 个文件`);
    
    if (results.success.length > 0) {
      console.log('\n✅ 成功同步的文件:');
      results.success.forEach(result => {
        console.log(`   📁 ${result.folder}/${result.file} → ${result.localPath} (${result.changed})`);
      });
    }
    
    if (results.skipped.length > 0) {
      console.log('\n⏭️  跳过的文件:');
      results.skipped.forEach(result => {
        console.log(`   📁 ${result.folder}/${result.file}: ${result.reason}${result.hash ? ` (${result.hash})` : ''}`);
      });
    }
    
    if (results.failed.length > 0) {
      console.log('\n❌ 同步失败的文件:');
      results.failed.forEach(result => {
        console.log(`   📁 ${result.folder}/${result.file}: ${result.error}`);
      });
    }
    
    // 显示本地文件结构
    if (results.success.length > 0) {
      console.log('\n📂 本地文件结构:');
      console.log('================');
      
      folders.forEach(folder => {
        const folderPath = require('path').join(process.cwd(), folder.local_path);
        if (require('fs').existsSync(folderPath)) {
          console.log(`\n📁 ${folder.name} (${folder.local_path}):`);
          try {
            const files = require('fs').readdirSync(folderPath);
            files.forEach(file => {
              if (file.endsWith('.json')) {
                const filePath = require('path').join(folderPath, file);
                const stats = require('fs').statSync(filePath);
                console.log(`   📄 ${file} (${stats.size} bytes)`);
              }
            });
          } catch (error) {
            console.log(`   ⚠️  读取文件夹失败: ${error.message}`);
          }
        }
      });
    }
    
    console.log('\n🚀 从S3到本地文件夹的同步完成！');
    console.log('🔄 同步方向: S3 → 本地文件夹 (只同步变更文件)');
    
    // 如果有失败的文件，返回错误状态
    if (results.failed.length > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ 从S3到本地文件夹的同步失败:', error);
    process.exit(1);
  }
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

// 如果直接运行此脚本
if (require.main === module) {
  syncS3ToLocalFolders();
}

module.exports = { syncS3ToLocalFolders }; 