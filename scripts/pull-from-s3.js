require('dotenv').config();

const { S3Client, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { Octokit } = require('@octokit/rest');
const FolderManager = require('../utils/folder-manager');
const crypto = require('crypto');
const path = require('path');
const { execSync } = require('child_process');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

async function pullFromS3() {
  try {
    // 验证环境变量
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN 环境变量未设置');
    }
    if (!process.env.GITHUB_REPO) {
      throw new Error('GITHUB_REPO 环境变量未设置');
    }
    
    console.log('🔑 GitHub Token 已加载:', process.env.GITHUB_TOKEN.substring(0, 10) + '...');
    console.log('📁 GitHub 仓库:', process.env.GITHUB_REPO);
    
    const folderManager = new FolderManager();
    const bucket = process.env.S3_BUCKET || 'rock-service-data';
    const [owner, repo] = (process.env.GITHUB_REPO || 's2265681/data-config-admin').split('/');
    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    
    // 验证配置
    const validation = folderManager.validateFoldersConfig();
    if (!validation.isValid) {
      console.error('配置验证失败:', validation.errors);
      throw new Error('配置验证失败');
    }
    
    console.log('🔄 开始从S3拉取文件到GitHub...');
    console.log(`📦 S3 Bucket: ${bucket}`);
    console.log(`🌍 区域: ${process.env.AWS_REGION || 'ap-southeast-2'}`);
    console.log(`📁 GitHub仓库: ${owner}/${repo}`);
    console.log(`🌿 目标分支: ${branch}`);
    console.log('');
    
    const folders = folderManager.getFolders();
    const results = {
      success: [],
      failed: [],
      skipped: []
    };
    
    for (const folder of folders) {
      console.log(`📁 处理文件夹: ${folder.name} (${folder.description})`);
      
      // 处理staging环境
      if (folder.s3_prefix_staging) {
        console.log(`   🔄 处理staging环境: ${folder.s3_prefix_staging}`);
        await processEnvironment(folder, 'staging', bucket, owner, repo, results, branch);
      }
      
      // 处理production环境
      if (folder.s3_prefix_production) {
        console.log(`   🔄 处理production环境: ${folder.s3_prefix_production}`);
        await processEnvironment(folder, 'production', bucket, owner, repo, results, branch);
      }
      
      console.log(`📁 文件夹 ${folder.name} 处理完成\n`);
    }
    
    // 输出结果汇总
    console.log('📊 从S3拉取结果汇总:');
    console.log('========================');
    console.log(`✅ 成功: ${results.success.length} 个文件`);
    console.log(`❌ 失败: ${results.failed.length} 个文件`);
    console.log(`⏭️  跳过: ${results.skipped.length} 个文件`);
    
    if (results.success.length > 0) {
      console.log('\n✅ 成功拉取的文件:');
      results.success.forEach(result => {
        console.log(`   📁 ${result.folder}/${result.file} (${result.environment}) → ${result.githubPath}`);
      });
    }
    
    if (results.skipped.length > 0) {
      console.log('\n⏭️  跳过的文件:');
      results.skipped.forEach(result => {
        console.log(`   📁 ${result.folder}/${result.file} (${result.environment}): ${result.reason}`);
      });
    }
    
    if (results.failed.length > 0) {
      console.log('\n❌ 拉取失败的文件:');
      results.failed.forEach(result => {
        console.log(`   📁 ${result.folder}/${result.file} (${result.environment}): ${result.error}`);
        if (result.details) {
          console.log(`      GitHub API状态: ${result.details.status}`);
          if (result.details.data && result.details.data.message) {
            console.log(`      GitHub错误: ${result.details.data.message}`);
          }
        }
      });
    }
    
    console.log('\n🔄 从S3拉取完成！');
    console.log('📝 所有文件已同步到当前分支');
    
    // 如果有失败的文件，返回错误状态
    if (results.failed.length > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ 从S3拉取失败:', error);
    process.exit(1);
  }
}

async function processEnvironment(folder, environment, bucket, owner, repo, results, branch) {
  const s3Prefix = environment === 'production' ? folder.s3_prefix_production : folder.s3_prefix_staging;
  
  try {
    // 列出S3中该前缀下的所有文件
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: s3Prefix
    });
    
    const listResult = await s3Client.send(listCommand);
    
    if (!listResult.Contents || listResult.Contents.length === 0) {
      console.log(`      ⚠️  S3前缀 ${s3Prefix} 下没有文件`);
      return;
    }
    
    for (const s3Object of listResult.Contents) {
      const s3Key = s3Object.Key;
      const fileName = s3Key.split('/').pop();
      
      // 检查是否是JSON文件
      if (!fileName.endsWith('.json')) {
        console.log(`      ⚠️  跳过非JSON文件: ${fileName}`);
        continue;
      }
      
      // 检查文件是否在配置中
      const fileConfig = folder.files.find(f => f.name === fileName);
      if (!fileConfig) {
        console.log(`      ⚠️  文件 ${fileName} 不在配置中，跳过`);
        results.skipped.push({
          folder: folder.name,
          file: fileName,
          environment: environment,
          reason: '文件不在配置中'
        });
        continue;
      }
      
      try {
        console.log(`      📄 处理文件: ${fileName} (${environment})`);
        
        // 从S3获取文件内容
        const getObjectCommand = new GetObjectCommand({
          Bucket: bucket,
          Key: s3Key
        });
        
        const s3Response = await s3Client.send(getObjectCommand);
        const fileContent = await streamToString(s3Response.Body);
        
        // 构建GitHub文件路径 - 统一使用当前分支，按环境分类目录
        let githubFilePath;
        if (environment === 'staging' && folder.local_path_staging) {
          githubFilePath = `${folder.local_path_staging}/${fileName}`;
        } else if (environment === 'production' && folder.local_path_production) {
          githubFilePath = `${folder.local_path_production}/${fileName}`;
        } else {
          throw new Error(`文件夹 ${folder.name} 未配置 ${environment} 环境的本地路径`);
        }
        
        console.log(`         📂 GitHub路径: ${githubFilePath}`);
        
        // 自动递归创建父目录
        const placeholderFiles = await ensureGithubDirs(owner, repo, githubFilePath, branch);
        
        // 检查GitHub中是否已存在该文件
        let currentFile = null;
        try {
          const response = await octokit.repos.getContent({
            owner,
            repo,
            path: githubFilePath,
            ref: branch
          });
          currentFile = response.data;
          console.log(`         ✅ GitHub文件已存在`);
        } catch (error) {
          if (error.status === 404) {
            console.log(`         📄 GitHub文件不存在，将创建新文件`);
          } else {
            console.error(`         ❌ GitHub API错误:`, error.message);
            throw error;
          }
        }
        
        // 计算文件内容的SHA
        const contentBuffer = Buffer.from(fileContent, 'utf8');
        const sha = crypto.createHash('sha1').update(contentBuffer).digest('hex');
        
        // 强制同步所有文件，不检查内容是否变化
        // 注释掉内容检查逻辑，确保所有文件都能同步
        /*
        if (currentFile && currentFile.sha === sha) {
          console.log(`         ⏭️  文件内容未变化，跳过`);
          results.skipped.push({
            folder: folder.name,
            file: fileName,
            environment: environment,
            reason: '文件内容未变化'
          });
          continue;
        }
        */
        
        // 生成提交信息
        const commitMessage = `🔄 从S3拉取: ${fileName} (${environment})`;
        
        // 更新GitHub文件
        await octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: githubFilePath,
          message: commitMessage,
          content: contentBuffer.toString('base64'),
          sha: currentFile ? currentFile.sha : undefined,
          branch: branch
        });
        
        // 删除占位文件
        if (placeholderFiles.length > 0) {
          await deletePlaceholderFiles(owner, repo, placeholderFiles, branch);
        }
        
        console.log(`         ✅ 成功拉取: ${fileName} (${environment})`);
        results.success.push({
          folder: folder.name,
          file: fileName,
          environment: environment,
          githubPath: githubFilePath,
          s3Key: s3Key,
          changed: currentFile ? '更新' : '新增'
        });
        
      } catch (error) {
        console.error(`         ❌ 拉取失败: ${fileName} (${environment})`);
        console.error(`           错误详情: ${error.message}`);
        if (error.response) {
          console.error(`           GitHub API状态: ${error.response.status}`);
          console.error(`           GitHub API响应: ${JSON.stringify(error.response.data, null, 2)}`);
        }
        results.failed.push({
          folder: folder.name,
          file: fileName,
          environment: environment,
          error: error.message,
          details: error.response ? {
            status: error.response.status,
            data: error.response.data
          } : null
        });
      }
    }
    
  } catch (error) {
    console.error(`   ❌ 处理 ${environment} 环境失败:`, error.message);
    throw error;
  }
}

// 辅助函数：将流转换为字符串
async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

// 删除占位文件
async function deletePlaceholderFiles(owner, repo, placeholderFiles, branch) {
  for (const placeholderPath of placeholderFiles) {
    try {
      // 获取文件的SHA
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: placeholderPath,
        ref: branch
      });
      
      // 删除占位文件
      await octokit.repos.deleteFile({
        owner,
        repo,
        path: placeholderPath,
        message: `chore: remove placeholder ${placeholderPath}`,
        sha: response.data.sha,
        branch: branch
      });
      
      console.log(`         🗑️  删除占位文件: ${placeholderPath}`);
    } catch (error) {
      // 如果占位文件不存在或删除失败，忽略错误
      console.log(`         ⚠️  占位文件删除失败: ${placeholderPath} (${error.message})`);
    }
  }
}

// 自动递归创建GitHub父目录
async function ensureGithubDirs(owner, repo, fullPath, branch) {
  const dirs = fullPath.split('/').slice(0, -1); // 去掉文件名
  let cur = '';
  const placeholderFiles = [];
  for (const dir of dirs) {
    cur = cur ? `${cur}/${dir}` : dir;
    try {
      await octokit.repos.getContent({ owner, repo, path: cur, ref: branch });
    } catch (e) {
      if (e.status === 404) {
        // 创建README.md占位
        await octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: `${cur}/README.md`,
          message: `chore: create ${cur}/README.md for directory placeholder`,
          content: Buffer.from(`# ${cur}\n\n目录占位文件`).toString('base64'),
          branch: branch
        });
        console.log(`         📁 自动创建GitHub目录: ${cur}`);
        placeholderFiles.push(`${cur}/README.md`);
      } else {
        throw e;
      }
    }
  }
  return placeholderFiles;
}

// 如果直接运行此脚本
if (require.main === module) {
  pullFromS3();
}

module.exports = { pullFromS3 }; 