const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Octokit } = require('@octokit/rest');
const FolderManager = require('../utils/folder-manager');
const crypto = require('crypto');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

exports.handler = async (event) => {
  console.log('S3到GitHub同步事件触发:', JSON.stringify(event, null, 2));
  
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
        await syncS3ToGithub(bucket, key, fileInfo, pathInfo, folderManager);
      } else if (eventName.startsWith('ObjectRemoved')) {
        await removeFromGithub(fileInfo, pathInfo, folderManager);
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'S3到GitHub同步完成' })
    };
  } catch (error) {
    console.error('S3到GitHub同步失败:', error);
    throw error;
  }
};

function isPathMonitored(s3Key, folderManager) {
  // 根据S3 key判断是否在监控范围内
  const parts = s3Key.split('/');
  if (parts.length < 3) {
    return { monitored: false };
  }
  
  const s3Prefix = parts[0];
  const environment = parts[1];
  const fileName = parts[2];
  
  // 检查是否是JSON文件
  if (!fileName || !fileName.endsWith('.json')) {
    return { monitored: false };
  }
  
  // 根据S3前缀找到对应的文件夹
  const folder = folderManager.getFolders().find(f => {
    const stagingPrefix = f.s3_prefix_staging;
    const productionPrefix = f.s3_prefix_production;
    
    // 提取基础前缀（去掉环境部分）
    const stagingBase = stagingPrefix ? stagingPrefix.split('/')[0] : null;
    const productionBase = productionPrefix ? productionPrefix.split('/')[0] : null;
    
    return stagingBase === s3Prefix || productionBase === s3Prefix;
  });
  
  if (!folder) {
    console.log(`未找到对应的文件夹配置: ${s3Prefix}`);
    return { monitored: false };
  }
  
  // 检查是否配置了对应环境的监控路径
  const stagingPrefix = folder.s3_prefix_staging;
  const productionPrefix = folder.s3_prefix_production;
  
  // 根据环境检查是否配置了监控路径
  if (environment === 'staging' && !stagingPrefix) {
    console.log(`文件夹 ${folder.name} 未配置 staging 环境监控路径`);
    return { monitored: false };
  }
  
  if (environment === 'production' && !productionPrefix) {
    console.log(`文件夹 ${folder.name} 未配置 production 环境监控路径`);
    return { monitored: false };
  }
  
  // 检查文件是否在文件夹配置中
  const fileConfig = folder.files.find(f => f.name === fileName);
  if (!fileConfig) {
    console.log(`文件 ${fileName} 不在文件夹 ${folder.name} 的配置中`);
    return { monitored: false };
  }
  
  // 验证路径是否匹配配置的前缀
  const expectedPrefix = environment === 'staging' ? stagingPrefix : productionPrefix;
  const actualPrefix = `${s3Prefix}/${environment}`;
  
  if (expectedPrefix !== actualPrefix) {
    console.log(`路径不匹配: 期望 ${expectedPrefix}, 实际 ${actualPrefix}`);
    return { monitored: false };
  }
  
  console.log(`✅ 路径在监控范围内: ${s3Key} (${folder.name}/${environment})`);
  
  return {
    monitored: true,
    environment: environment,
    prefix: `${s3Prefix}/${environment}/`,
    folder: folder
  };
}

function extractFileInfo(s3Key, folderManager) {
  // 从S3 key中提取文件夹和文件信息
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
  const folder = folderManager.getFolders().find(f => {
    const stagingPrefix = f.s3_prefix_staging;
    const productionPrefix = f.s3_prefix_production;
    
    // 提取基础前缀（去掉环境部分）
    const stagingBase = stagingPrefix ? stagingPrefix.split('/')[0] : null;
    const productionBase = productionPrefix ? productionPrefix.split('/')[0] : null;
    
    return stagingBase === s3Prefix || productionBase === s3Prefix;
  });
  
  if (!folder) {
    console.log(`未找到对应的文件夹配置: ${s3Prefix}`);
    return null;
  }
  
  // 检查是否配置了对应环境的监控路径
  const stagingPrefix = folder.s3_prefix_staging;
  const productionPrefix = folder.s3_prefix_production;
  
  // 根据环境检查是否配置了监控路径
  if (environment === 'staging' && !stagingPrefix) {
    console.log(`文件夹 ${folder.name} 未配置 staging 环境监控路径，跳过处理`);
    return null;
  }
  
  if (environment === 'production' && !productionPrefix) {
    console.log(`文件夹 ${folder.name} 未配置 production 环境监控路径，跳过处理`);
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
    description: fileConfig.description
  };
}

async function syncS3ToGithub(bucket, key, fileInfo, pathInfo, folderManager) {
  try {
    console.log(`🔄 开始同步文件到GitHub: ${fileInfo.fileName}`);
    
    // 从S3获取文件内容
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    const s3Response = await s3Client.send(getObjectCommand);
    const fileContent = await streamToString(s3Response.Body);
    
    // 获取环境信息
    const environment = pathInfo.environment;
    const branch = environment === 'production' ? 'main' : 'staging';
    
    // 获取GitHub仓库信息
    const [owner, repo] = process.env.GITHUB_REPO.split('/');
    
    // 构建GitHub文件路径
    let githubFilePath;
    if (environment === 'staging' && fileInfo.folder.local_path_staging) {
      githubFilePath = `${fileInfo.folder.local_path_staging}/${fileInfo.fileName}`;
    } else if (environment === 'production' && fileInfo.folder.local_path_production) {
      githubFilePath = `${fileInfo.folder.local_path_production}/${fileInfo.fileName}`;
    } else if (fileInfo.folder.local_path) {
      githubFilePath = `${fileInfo.folder.local_path}/${fileInfo.fileName}`;
    } else {
      throw new Error(`文件夹 ${fileInfo.folderName} 未配置 ${environment} 环境的本地路径`);
    }
    
    // 检查文件是否已存在
    let currentFile = null;
    try {
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: githubFilePath,
        ref: branch
      });
      currentFile = response.data;
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
    }
    
    // 计算文件内容的SHA
    const contentBuffer = Buffer.from(fileContent, 'utf8');
    const sha = crypto.createHash('sha1').update(contentBuffer).digest('hex');
    
    // 如果文件内容没有变化，跳过更新
    if (currentFile && currentFile.sha === sha) {
      console.log(`⏭️  ${fileInfo.fileName} 内容未变化，跳过GitHub更新`);
      return;
    }
    
    // 生成提交信息
    const commitMessage = `🔄 从S3同步: ${fileInfo.fileName} (${environment})`;
    
    // 更新GitHub文件
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: githubFilePath,
      message: commitMessage,
      content: contentBuffer.toString('base64'),
      branch: branch,
      sha: currentFile ? currentFile.sha : undefined
    });
    
    console.log(`✅ 成功同步 ${fileInfo.fileName} 到GitHub ${branch}分支`);
    console.log(`📝 提交信息: ${commitMessage}`);
    
  } catch (error) {
    console.error(`❌ 同步 ${fileInfo.fileName} 到GitHub失败:`, error);
    throw error;
  }
}

async function removeFromGithub(fileInfo, pathInfo, folderManager) {
  try {
    console.log(`🗑️  开始从GitHub删除文件: ${fileInfo.fileName}`);
    
    // 获取环境信息
    const environment = pathInfo.environment;
    const branch = environment === 'production' ? 'main' : 'staging';
    
    // 获取GitHub仓库信息
    const [owner, repo] = process.env.GITHUB_REPO.split('/');
    
    // 构建GitHub文件路径
    let githubFilePath;
    if (environment === 'staging' && fileInfo.folder.local_path_staging) {
      githubFilePath = `${fileInfo.folder.local_path_staging}/${fileInfo.fileName}`;
    } else if (environment === 'production' && fileInfo.folder.local_path_production) {
      githubFilePath = `${fileInfo.folder.local_path_production}/${fileInfo.fileName}`;
    } else if (fileInfo.folder.local_path) {
      githubFilePath = `${fileInfo.folder.local_path}/${fileInfo.fileName}`;
    } else {
      throw new Error(`文件夹 ${fileInfo.folderName} 未配置 ${environment} 环境的本地路径`);
    }
    
    // 检查文件是否已存在
    let currentFile = null;
    try {
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: githubFilePath,
        ref: branch
      });
      currentFile = response.data;
    } catch (error) {
      if (error.status === 404) {
        console.log(`📄 文件 ${fileInfo.fileName} 在GitHub中不存在，无需删除`);
        return;
      }
      throw error;
    }
    
    // 生成提交信息
    const commitMessage = `🗑️  从S3删除: ${fileInfo.fileName} (${environment})`;
    
    // 删除GitHub文件
    await octokit.repos.deleteFile({
      owner,
      repo,
      path: githubFilePath,
      message: commitMessage,
      branch: branch,
      sha: currentFile.sha
    });
    
    console.log(`✅ 成功从GitHub删除文件: ${fileInfo.fileName}`);
    console.log(`📝 提交信息: ${commitMessage}`);
    
  } catch (error) {
    console.error(`❌ 从GitHub删除文件 ${fileInfo.fileName} 失败:`, error);
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