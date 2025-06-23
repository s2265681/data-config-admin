require('dotenv').config();

const { S3Client, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { Octokit } = require('@octokit/rest');
const FolderManager = require('../utils/folder-manager');
const crypto = require('crypto');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

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
    
    // 获取当前分支信息
    let currentBranch;
    let triggerBranch;
    
    try {
      currentBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
      console.log(`🌿 当前分支: ${currentBranch}`);
    } catch (error) {
      console.warn('⚠️  无法获取Git分支信息，使用默认分支');
      currentBranch = 'main';
    }
    
    // 确定触发分支
    if (process.env.GITHUB_REF) {
      // 在GitHub Actions环境中
      triggerBranch = process.env.GITHUB_REF.replace('refs/heads/', '');
    } else if (process.env.CI) {
      // 在其他CI环境中
      triggerBranch = process.env.BRANCH || process.env.CI_COMMIT_REF_NAME || currentBranch;
    } else {
      // 本地环境
      triggerBranch = currentBranch;
    }
    
    console.log(`🔗 触发分支: ${triggerBranch}`);
    
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
    console.log(`🌿 目标分支: ${currentBranch}`);
    console.log('');
    
    const folders = folderManager.getFolders();
    const results = {
      success: [],
      failed: [],
      skipped: [],
      changed: [] // 存储有变化的文件，用于批量提交
    };
    
    // 处理每个文件夹
    for (const folder of folders) {
      console.log(`📁 处理文件夹: ${folder.name}`);
      
      // 处理staging环境
      if (folder.s3_prefix_staging) {
        console.log(`   🌍 处理staging环境...`);
        await processEnvironmentBatch(folder, 'staging', bucket, owner, repo, results, currentBranch);
      }
      
      // 处理production环境
      if (folder.s3_prefix_production) {
        console.log(`   🚀 处理production环境...`);
        await processEnvironmentBatch(folder, 'production', bucket, owner, repo, results, currentBranch);
      }
      
      console.log(`📁 文件夹 ${folder.name} 处理完成\n`);
    }
    
    // 批量提交有变化的文件
    if (results.changed.length > 0) {
      console.log('🐙 开始批量提交有变化的文件...');
      console.log('=====================================');
      
      try {
        await batchCommitFiles(owner, repo, results.changed, currentBranch, triggerBranch);
        console.log(`✅ 成功批量提交 ${results.changed.length} 个文件`);
      } catch (error) {
        console.error('❌ 批量提交失败:', error.message);
        results.failed.push({
          folder: 'batch-commit',
          file: 'multiple',
          error: `批量提交失败: ${error.message}`
        });
      }
    } else {
      console.log('⏭️  没有文件需要提交，所有文件都未变化');
    }
    
    // 输出结果汇总
    console.log('\n📊 拉取结果汇总:');
    console.log('================');
    console.log(`✅ 成功: ${results.success.length} 个文件`);
    console.log(`⏭️  跳过: ${results.skipped.length} 个文件`);
    console.log(`❌ 失败: ${results.failed.length} 个文件`);
    console.log(`🔄 有变化: ${results.changed.length} 个文件`);
    
    if (results.success.length > 0) {
      console.log('\n✅ 成功拉取的文件:');
      results.success.forEach(result => {
        console.log(`   📁 ${result.folder}/${result.file} (${result.environment})`);
      });
    }
    
    if (results.skipped.length > 0) {
      console.log('\n⏭️  跳过的文件:');
      results.skipped.forEach(result => {
        console.log(`   📁 ${result.folder}/${result.file}: ${result.reason}`);
      });
    }
    
    if (results.failed.length > 0) {
      console.log('\n❌ 拉取失败的文件:');
      results.failed.forEach(result => {
        console.log(`   📁 ${result.folder}/${result.file}: ${result.error}`);
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

async function processEnvironmentBatch(folder, environment, bucket, owner, repo, results, branch) {
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
        const s3Content = await streamToString(s3Response.Body);
        
        // 构建本地文件路径
        let localFilePath;
        if (environment === 'staging' && folder.local_path_staging) {
          localFilePath = path.join(process.cwd(), folder.local_path_staging, fileName);
        } else if (environment === 'production' && folder.local_path_production) {
          localFilePath = path.join(process.cwd(), folder.local_path_production, fileName);
        } else {
          throw new Error(`文件夹 ${folder.name} 未配置 ${environment} 环境的本地路径`);
        }
        
        console.log(`         📂 本地路径: ${localFilePath}`);
        
        // 检查本地文件是否存在
        let localContent = null;
        let localExists = false;
        
        try {
          localContent = fs.readFileSync(localFilePath, 'utf8');
          localExists = true;
          console.log(`         ✅ 本地文件存在`);
        } catch (error) {
          if (error.code === 'ENOENT') {
            console.log(`         📄 本地文件不存在，将创建新文件`);
          } else {
            throw error;
          }
        }
        
        // 比较S3和本地文件内容
        let contentChanged = false;
        if (!localExists) {
          contentChanged = true;
          console.log(`         🔄 本地文件不存在，需要创建`);
        } else {
          // 计算S3和本地文件的哈希值进行比较
          const s3Hash = crypto.createHash('sha256').update(s3Content).digest('hex');
          const localHash = crypto.createHash('sha256').update(localContent).digest('hex');
          
          if (s3Hash !== localHash) {
            contentChanged = true;
            console.log(`         🔄 文件内容已变化 (S3: ${s3Hash.substring(0, 8)}..., 本地: ${localHash.substring(0, 8)}...)`);
          } else {
            console.log(`         ⏭️  文件内容未变化，跳过`);
            results.skipped.push({
              folder: folder.name,
              file: fileName,
              environment: environment,
              reason: '文件内容未变化'
            });
            continue;
          }
        }
        
        // 确保本地目录存在
        const localDir = path.dirname(localFilePath);
        if (!fs.existsSync(localDir)) {
          fs.mkdirSync(localDir, { recursive: true });
          console.log(`         📁 创建本地目录: ${localDir}`);
        }
        
        // 写入本地文件
        fs.writeFileSync(localFilePath, s3Content, 'utf8');
        console.log(`         ✅ 成功写入本地文件: ${fileName}`);
        
        // 添加到成功列表
        results.success.push({
          folder: folder.name,
          file: fileName,
          environment: environment,
          localPath: localFilePath,
          s3Key: s3Key,
          changed: localExists ? '更新' : '新增'
        });
        
        // 添加到批量提交列表
        results.changed.push({
          path: localFilePath,
          content: s3Content,
          folder: folder.name,
          fileName: fileName,
          environment: environment,
          relativePath: path.relative(process.cwd(), localFilePath)
        });
        
      } catch (error) {
        console.error(`         ❌ 处理失败: ${fileName} (${environment})`);
        console.error(`           错误详情: ${error.message}`);
        results.failed.push({
          folder: folder.name,
          file: fileName,
          environment: environment,
          error: error.message
        });
      }
    }
    
  } catch (error) {
    console.error(`   ❌ 处理 ${environment} 环境失败:`, error.message);
    throw error;
  }
}

async function batchCommitFiles(owner, repo, changedFiles, branch, triggerBranch) {
  try {
    // 获取当前分支的最新commit SHA
    const { data: ref } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`
    });
    
    const baseSha = ref.object.sha;
    console.log(`📋 当前分支SHA: ${baseSha.substring(0, 8)}...`);
    
    // 创建tree items
    const treeItems = changedFiles.map(file => ({
      path: file.relativePath,
      mode: '100644',
      type: 'blob',
      content: file.content
    }));
    
    console.log(`🌳 准备创建tree，包含 ${treeItems.length} 个文件`);
    
    // 创建tree
    const { data: tree } = await octokit.git.createTree({
      owner,
      repo,
      base_tree: baseSha,
      tree: treeItems
    });
    
    console.log(`🌳 创建tree: ${tree.sha.substring(0, 8)}...`);
    
    // 生成提交信息
    const commitMessage = `🔄 从S3批量同步配置文件\n\n` +
      `📁 同步的文件 (${changedFiles.length} 个):\n` +
      changedFiles.map(file => `- ${file.folder}/${file.fileName} (${file.environment})`).join('\n') +
      `\n\n🔗 触发分支: ${triggerBranch}` +
      `\n⏰ 同步时间: ${new Date().toISOString()}` +
      `\n📦 S3 Bucket: ${process.env.S3_BUCKET || 'rock-service-data'}`;
    
    // 创建commit
    const { data: commit } = await octokit.git.createCommit({
      owner,
      repo,
      message: commitMessage,
      tree: tree.sha,
      parents: [baseSha]
    });
    
    console.log(`📝 创建commit: ${commit.sha.substring(0, 8)}...`);
    
    // 更新分支
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: commit.sha
    });
    
    console.log(`✅ 成功更新分支 ${branch}`);
    console.log(`📝 提交信息: ${commitMessage.split('\n')[0]}`);
    
  } catch (error) {
    console.error('❌ 批量提交失败:', error.message);
    if (error.response) {
      console.error('📋 GitHub API状态:', error.response.status);
      console.error('📋 GitHub API响应:', error.response.data);
    }
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

// 如果直接运行此脚本
if (require.main === module) {
  pullFromS3();
}

module.exports = { pullFromS3 }; 