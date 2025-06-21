const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const FolderManager = require('../utils/folder-manager');
const crypto = require('crypto');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-2' });

exports.handler = async (event) => {
  console.log('S3到本地文件夹同步事件触发:', JSON.stringify(event, null, 2));
  
  try {
    const folderManager = new FolderManager();
    
    // 验证配置
    const validation = folderManager.validateFoldersConfig();
    if (!validation.isValid) {
      console.error('配置验证失败:', validation.errors);
      throw new Error('配置验证失败');
    }
    
    for (const record of event.Records) {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      const eventName = record.eventName;
      
      console.log(`处理S3事件: ${eventName}, Bucket: ${bucket}, Key: ${key}`);
      
      // 检查路径是否在监控范围内
      const pathInfo = isPathMonitored(key, folderManager);
      if (!pathInfo.monitored) {
        console.log(`跳过非监控路径: ${key}`);
        continue;
      }
      
      // 提取文件名和文件夹信息
      const fileInfo = extractFileInfo(key, folderManager);
      if (!fileInfo) {
        console.log('跳过非配置文件:', key);
        continue;
      }
      
      if (eventName.startsWith('ObjectCreated') || eventName.startsWith('ObjectModified')) {
        await syncS3ToLocalFolder(bucket, key, fileInfo, pathInfo, folderManager);
      } else if (eventName.startsWith('ObjectRemoved')) {
        await removeFromLocalFolder(key, fileInfo, pathInfo, folderManager);
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'S3到本地文件夹同步完成' })
    };
  } catch (error) {
    console.error('S3到本地文件夹同步失败:', error);
    throw error;
  }
};

function isPathMonitored(s3Key, folderManager) {
  const monitoringConfig = folderManager.getMonitoringConfig();
  
  for (const pathConfig of monitoringConfig.s3_paths) {
    if (s3Key.startsWith(pathConfig.prefix) && s3Key.endsWith(pathConfig.suffix)) {
      return {
        monitored: true,
        environment: pathConfig.environment,
        prefix: pathConfig.prefix
      };
    }
  }
  
  return { monitored: false };
}

function extractFileInfo(s3Key, folderManager) {
  // 从S3 key中提取文件夹和文件信息
  // 例如: config/staging/test.json -> { folder: 'config', fileName: 'test.json' }
  const parts = s3Key.split('/');
  
  if (parts.length < 3) {
    return null;
  }
  
  const s3Prefix = parts[0]; // config, config2, config3
  const environment = parts[1]; // staging, production
  const fileName = parts[2]; // test.json
  
  // 检查是否是JSON文件
  if (!fileName || !fileName.endsWith('.json')) {
    return null;
  }
  
  // 根据S3前缀找到对应的文件夹
  const folder = folderManager.getFolders().find(f => f.s3_prefix === s3Prefix);
  if (!folder) {
    console.log(`未找到对应的文件夹配置: ${s3Prefix}`);
    return null;
  }
  
  // 检查文件是否在文件夹配置中
  const fileConfig = folder.files.find(f => f.name === fileName);
  if (!fileConfig) {
    console.log(`文件 ${fileName} 不在文件夹 ${folder.name} 的配置中`);
    return null;
  }
  
  return {
    folder: folder,
    folderName: folder.name,
    fileName: fileName,
    environment: environment,
    localPath: `${folder.local_path}/${fileName}`,
    description: fileConfig.description
  };
}

async function syncS3ToLocalFolder(bucket, key, fileInfo, pathInfo, folderManager) {
  try {
    console.log(`🔄 开始同步文件到本地文件夹: ${fileInfo.fileName}`);
    console.log(`📁 文件夹: ${fileInfo.folderName} (${fileInfo.folder.description})`);
    console.log(`📂 本地路径: ${fileInfo.localPath}`);
    console.log(`🌍 环境: ${fileInfo.environment}`);
    
    // 从S3获取文件内容和元数据
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    const s3Response = await s3Client.send(getObjectCommand);
    const fileContent = await streamToString(s3Response.Body);
    
    // 检查文件来源，避免循环同步
    const metadata = s3Response.Metadata || {};
    const syncedFrom = metadata['synced-from'];
    const syncDirection = metadata['sync-direction'];
    const syncedAt = metadata['synced-at'];
    
    console.log(`📋 文件元数据:`, {
      syncedFrom,
      syncDirection,
      syncedAt,
      environment: metadata['environment']
    });
    
    // 检查是否是最近从本地同步的文件（5分钟内）
    const isRecentSync = false;
    if (syncedAt) {
      const syncTime = new Date(syncedAt);
      const now = new Date();
      const timeDiff = now - syncTime;
      const fiveMinutes = 5 * 60 * 1000; // 5分钟
      isRecentSync = timeDiff < fiveMinutes;
    }
    
    // 如果文件是从本地同步过来的，跳过同步回本地
    if (syncDirection === 'github-to-s3' || syncedFrom === 'github-staging' || syncedFrom === 'github-production') {
      console.log(`⏭️  跳过同步: ${fileInfo.fileName} 来源为GitHub (${syncedFrom})，避免循环同步`);
      return;
    }
    
    // 如果是最近同步的文件，也跳过
    if (isRecentSync) {
      console.log(`⏭️  跳过同步: ${fileInfo.fileName} 最近已同步 (${syncedAt})，避免循环同步`);
      return;
    }
    
    // 计算文件内容的哈希
    const contentHash = crypto.createHash('sha256').update(fileContent).digest('hex');
    
    // 检查本地文件是否存在及其哈希
    let localHash = null;
    let localExists = false;
    
    try {
      if (folderManager.fileExists(fileInfo.folderName, fileInfo.fileName)) {
        localExists = true;
        localHash = folderManager.getFileHash(fileInfo.folderName, fileInfo.fileName);
        console.log(`📂 本地文件存在，哈希: ${localHash.substring(0, 8) + '...'}`);
      }
    } catch (error) {
      console.log(`📂 本地文件不存在或读取失败`);
    }
    
    // 如果本地文件内容没有变化，跳过更新
    if (localExists && localHash === contentHash) {
      console.log(`⏭️  ${fileInfo.fileName} 内容未变化，跳过更新`);
      return;
    }
    
    // 确保本地文件夹存在
    const folderPath = fileInfo.folder.local_path;
    const fullFolderPath = require('path').join(process.cwd(), folderPath);
    if (!require('fs').existsSync(fullFolderPath)) {
      require('fs').mkdirSync(fullFolderPath, { recursive: true });
      console.log(`📁 创建本地文件夹: ${folderPath}`);
    }
    
    // 写入本地文件
    folderManager.writeFile(fileInfo.folderName, fileInfo.fileName, fileContent);
    
    console.log(`✅ 成功同步 ${fileInfo.fileName} 到本地文件夹 ${fileInfo.folderName}`);
    console.log(`📝 文件大小: ${fileContent.length} bytes`);
    console.log(`🔐 文件哈希: ${contentHash.substring(0, 8) + '...'}`);
    
    // 验证JSON格式
    if (folderManager.validateJsonFile(fileInfo.folderName, fileInfo.fileName)) {
      console.log(`✅ JSON格式验证通过`);
    } else {
      console.log(`⚠️  JSON格式验证失败`);
    }
    
  } catch (error) {
    console.error(`❌ 同步 ${fileInfo.fileName} 到本地失败:`, error);
    throw error;
  }
}

async function removeFromLocalFolder(key, fileInfo, pathInfo, folderManager) {
  try {
    console.log(`🗑️  开始删除本地文件: ${fileInfo.fileName}`);
    console.log(`📁 文件夹: ${fileInfo.folderName}`);
    console.log(`📂 本地路径: ${fileInfo.localPath}`);
    
    // 检查本地文件是否存在
    if (folderManager.fileExists(fileInfo.folderName, fileInfo.fileName)) {
      // 删除本地文件
      const filePath = require('path').join(process.cwd(), fileInfo.localPath);
      require('fs').unlinkSync(filePath);
      console.log(`✅ 成功删除本地文件: ${fileInfo.fileName}`);
    } else {
      console.log(`ℹ️  本地文件不存在，无需删除: ${fileInfo.fileName}`);
    }
    
  } catch (error) {
    console.error(`❌ 删除本地文件 ${fileInfo.fileName} 失败:`, error);
    throw error;
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