const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Octokit } = require('@octokit/rest');
const FolderManager = require('../utils/folder-manager');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const s3Client = new S3Client({ 
  region: process.env.AWS_REGION || 'ap-southeast-2'
});

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

async function syncFoldersToS3() {
  try {
    const folderManager = new FolderManager();
    const bucket = process.env.S3_BUCKET || 'rock-service-data';
    const [owner, repo] = (process.env.GITHUB_REPO || 's2265681/data-config-admin').split('/');
    
    // 根据GitHub分支或环境变量确定环境
    let environment = process.env.ENVIRONMENT;
    if (!environment) {
      // 从GitHub分支判断环境
      const githubRef = process.env.GITHUB_REF || '';
      if (githubRef.includes('main') || githubRef.includes('master')) {
        environment = 'production';
      } else {
        environment = 'staging';
      }
    }
    
    const syncSource = process.env.SYNC_SOURCE || `github-${environment}`;
    
    console.log(`🚀 开始基于文件夹的智能同步到S3: ${bucket}`);
    console.log(`📁 环境: ${environment}`);
    console.log(`🌍 区域: ${process.env.AWS_REGION || 'ap-southeast-2'}`);
    console.log(`🔄 同步来源: ${syncSource}`);
    console.log(`🔗 GitHub分支: ${process.env.GITHUB_REF || 'unknown'}`);
    console.log(`🐙 GitHub仓库: ${owner}/${repo}`);
    console.log('');
    
    const folders = folderManager.getFolders();
    
    // 如果是production环境，自动从staging同步有变更的文件到本地production路径
    if (environment === 'production') {
      console.log('🔄 开始检查并同步 staging -> production 的本地文件变更...');
      console.log('===========================================================');
      let changesFound = false;
      
      for (const folder of folders) {
        for (const file of folder.files) {
          const stagingFilePath = path.join(process.cwd(), folder.local_path_staging, file.name);
          const productionFilePath = path.join(process.cwd(), folder.local_path_production, file.name);

          if (!fs.existsSync(stagingFilePath)) {
            continue; // staging文件不存在，跳过
          }

          const stagingContent = fs.readFileSync(stagingFilePath);
          const stagingHash = crypto.createHash('sha256').update(stagingContent).digest('hex');

          let productionHash = null;
          if (fs.existsSync(productionFilePath)) {
            const productionContent = fs.readFileSync(productionFilePath);
            productionHash = crypto.createHash('sha256').update(productionContent).digest('hex');
          }

          if (stagingHash !== productionHash) {
            changesFound = true;
            console.log(`   - 检测到变更: ${folder.name}/${file.name}`);
            
            const productionDir = path.dirname(productionFilePath);
            fs.mkdirSync(productionDir, { recursive: true });

            fs.copyFileSync(stagingFilePath, productionFilePath);
            console.log(`     ✅ 已将 staging 内容同步到: ${folder.local_path_production}/${file.name}`);
          }
        }
      }
      
      if (!changesFound) {
        console.log('   ✅ 所有 staging 和 production 文件均一致，无需同步。');
      }
      
      console.log('===========================================================');
      console.log('✅ 本地 staging -> production 同步检查完成。\n');
    }
    
    const results = {
      success: [],
      failed: [],
      skipped: [],
      githubSync: []
    };
    
    // 收集需要同步到GitHub的文件
    const filesToSyncToGitHub = [];
    
    for (const folder of folders) {
      // 动态选择本地路径和S3前缀
      const localPath = environment === 'production' ? folder.local_path_production : folder.local_path_staging;
      const s3Prefix = environment === 'production' ? folder.s3_prefix_production : folder.s3_prefix_staging;

      console.log(`📁 处理文件夹: ${folder.name} (${folder.description})`);
      console.log(`   📂 本地路径: ${localPath}`);
      console.log(`   ☁️  S3前缀: ${s3Prefix}`);
      console.log('');
      
      for (const file of folder.files) {
        const fileName = file.name;
        const s3Key = `${s3Prefix}/${fileName}`;
        
        try {
          console.log(`   📄 检查文件: ${fileName}`);
          console.log(`      📂 本地路径: ${localPath}/${fileName}`);
          console.log(`      ☁️  S3路径: ${s3Key}`);
          
          // 检查本地文件是否存在
          if (!folderManager.fileExists(folder.name, fileName, environment)) {
            console.log(`      ⚠️  本地文件不存在: ${fileName}`);
            
            // 如果是production环境，尝试从staging环境复制文件
            if (environment === 'production') {
              console.log(`      🔄 尝试从staging环境复制文件到production...`);
              
              try {
                // 检查staging环境是否存在该文件
                if (folderManager.fileExists(folder.name, fileName, 'staging')) {
                  // 读取staging环境的文件内容
                  const stagingContent = folderManager.readFile(folder.name, fileName, 'staging');
                  
                  // 创建production环境的目录结构
                  const productionPath = path.join(process.cwd(), folder.local_path_production);
                  if (!fs.existsSync(productionPath)) {
                    fs.mkdirSync(productionPath, { recursive: true });
                    console.log(`      📁 创建production目录: ${folder.local_path_production}`);
                  }
                  
                  // 写入production环境
                  const productionFilePath = path.join(productionPath, fileName);
                  fs.writeFileSync(productionFilePath, stagingContent, 'utf8');
                  console.log(`      ✅ 成功从staging复制到production: ${fileName}`);
                  
                  // 继续处理这个文件
                  const fileContent = stagingContent;
                  const localHash = crypto.createHash('sha256').update(fileContent).digest('hex');
                  
                  // 检查S3上文件是否存在及其哈希
                  let s3Hash = null;
                  let s3Exists = false;
                  try {
                    const headCommand = new HeadObjectCommand({
                      Bucket: bucket,
                      Key: s3Key
                    });
                    const headResult = await s3Client.send(headCommand);
                    s3Exists = true;
                    s3Hash = headResult.Metadata?.['file-hash'];
                    console.log(`      ☁️  S3文件存在，哈希: ${s3Hash ? s3Hash.substring(0, 8) + '...' : '无'}`);
                  } catch (error) {
                    if (error.name === 'NotFound') {
                      console.log(`      ☁️  S3文件不存在，需要上传`);
                    } else {
                      throw error;
                    }
                  }
                  
                  // 比较哈希，判断是否需要同步
                  if (s3Exists && s3Hash === localHash) {
                    console.log(`      ⏭️  文件未变更，跳过同步`);
                    results.skipped.push({
                      folder: folder.name,
                      file: fileName,
                      reason: '文件未变更（从staging复制）',
                      hash: localHash.substring(0, 8) + '...'
                    });
                    continue;
                  }
                  
                  // 上传到S3
                  const putObjectCommand = new PutObjectCommand({
                    Bucket: bucket,
                    Key: s3Key,
                    Body: fileContent,
                    ContentType: 'application/json',
                    Metadata: {
                      'synced-from': `${syncSource}-staging-copy`,
                      'synced-at': new Date().toISOString(),
                      'commit-sha': process.env.GITHUB_SHA || 'unknown',
                      'environment': environment,
                      'file-hash': localHash,
                      'source-folder': folder.name,
                      'source-file': fileName,
                      'sync-direction': 'github-to-s3',
                      'copied-from': 'staging'
                    }
                  });
                  
                  await s3Client.send(putObjectCommand);
                  
                  console.log(`      ✅ 成功同步（从staging复制）: ${fileName}`);
                  results.success.push({
                    folder: folder.name,
                    file: fileName,
                    s3Key: s3Key,
                    hash: localHash.substring(0, 8) + '...',
                    changed: '从staging复制'
                  });
                  
                  // 添加到GitHub同步列表
                  filesToSyncToGitHub.push({
                    path: `${localPath}/${fileName}`,
                    content: fileContent,
                    folder: folder.name,
                    fileName: fileName,
                    environment: environment
                  });
                  
                  continue;
                } else {
                  console.log(`      ❌ staging环境也不存在该文件，跳过: ${fileName}`);
                  results.skipped.push({
                    folder: folder.name,
                    file: fileName,
                    reason: '本地文件不存在，staging环境也不存在'
                  });
                  continue;
                }
              } catch (error) {
                console.error(`      ❌ 从staging复制文件失败: ${fileName}`, error.message);
                results.failed.push({
                  folder: folder.name,
                  file: fileName,
                  error: `从staging复制失败: ${error.message}`
                });
                continue;
              }
            } else {
              // 非production环境，直接跳过
              console.log(`      ⚠️  本地文件不存在，跳过: ${fileName}`);
              results.skipped.push({
                folder: folder.name,
                file: fileName,
                reason: '本地文件不存在'
              });
              continue;
            }
          }
          
          // 读取本地文件内容
          const fileContent = folderManager.readFile(folder.name, fileName, environment);
          const localHash = crypto.createHash('sha256').update(fileContent).digest('hex');
          
          // 检查S3上文件是否存在及其哈希
          let s3Hash = null;
          let s3Exists = false;
          try {
            const headCommand = new HeadObjectCommand({
              Bucket: bucket,
              Key: s3Key
            });
            const headResult = await s3Client.send(headCommand);
            s3Exists = true;
            s3Hash = headResult.Metadata?.['file-hash'];
            console.log(`      ☁️  S3文件存在，哈希: ${s3Hash ? s3Hash.substring(0, 8) + '...' : '无'}`);
          } catch (error) {
            if (error.name === 'NotFound') {
              console.log(`      ☁️  S3文件不存在，需要上传`);
            } else {
              throw error;
            }
          }
          
          // 比较哈希，判断是否需要同步
          if (s3Exists && s3Hash === localHash) {
            console.log(`      ⏭️  文件未变更，跳过同步`);
            results.skipped.push({
              folder: folder.name,
              file: fileName,
              reason: '文件未变更',
              hash: localHash.substring(0, 8) + '...'
            });
            continue;
          }
          
          // 上传到S3
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
              'file-hash': localHash,
              'source-folder': folder.name,
              'source-file': fileName,
              'sync-direction': 'github-to-s3'
            }
          });
          
          await s3Client.send(putObjectCommand);
          
          console.log(`      ✅ 成功同步: ${fileName}`);
          results.success.push({
            folder: folder.name,
            file: fileName,
            s3Key: s3Key,
            hash: localHash.substring(0, 8) + '...',
            changed: s3Exists ? '是' : '新增'
          });
          
          // 添加到GitHub同步列表
          filesToSyncToGitHub.push({
            path: `${localPath}/${fileName}`,
            content: fileContent,
            folder: folder.name,
            fileName: fileName,
            environment: environment
          });
          
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
    
    // 同步到GitHub master分支
    if (filesToSyncToGitHub.length > 0 && environment === 'production') {
      console.log('🐙 开始同步变更文件到GitHub master分支...');
      console.log('=====================================');
      
      try {
        // 获取当前master分支的最新commit SHA
        const { data: ref } = await octokit.git.getRef({
          owner,
          repo,
          ref: 'heads/main'
        });
        
        const baseSha = ref.object.sha;
        console.log(`📋 当前master分支SHA: ${baseSha.substring(0, 8)}...`);
        
        // 创建新的commit
        const treeItems = filesToSyncToGitHub.map(file => ({
          path: file.path,
          mode: '100644',
          type: 'blob',
          content: file.content
        }));
        
        // 创建tree
        const { data: tree } = await octokit.git.createTree({
          owner,
          repo,
          base_tree: baseSha,
          tree: treeItems
        });
        
        console.log(`🌳 创建tree: ${tree.sha.substring(0, 8)}...`);
        
        // 创建commit
        const commitMessage = `🔄 自动同步配置文件到master分支\n\n` +
          `📁 同步的文件:\n` +
          filesToSyncToGitHub.map(file => `- ${file.folder}/${file.fileName}`).join('\n') +
          `\n\n🔗 触发分支: ${process.env.GITHUB_REF || 'unknown'}` +
          `\n⏰ 同步时间: ${new Date().toISOString()}` +
          `\n🏷️  环境: ${environment}`;
        
        const { data: commit } = await octokit.git.createCommit({
          owner,
          repo,
          message: commitMessage,
          tree: tree.sha,
          parents: [baseSha]
        });
        
        console.log(`📝 创建commit: ${commit.sha.substring(0, 8)}...`);
        
        // 更新master分支
        await octokit.git.updateRef({
          owner,
          repo,
          ref: 'heads/main',
          sha: commit.sha
        });
        
        console.log(`✅ 成功更新master分支`);
        
        // 记录GitHub同步结果
        filesToSyncToGitHub.forEach(file => {
          results.githubSync.push({
            folder: file.folder,
            file: file.fileName,
            path: file.path,
            commitSha: commit.sha.substring(0, 8) + '...'
          });
        });
        
      } catch (error) {
        console.error('❌ 同步到GitHub失败:', error.message);
        results.failed.push({
          folder: 'github-sync',
          file: 'multiple',
          error: `GitHub同步失败: ${error.message}`
        });
      }
    }
    
    // 输出同步结果
    console.log('\n📊 基于文件夹的同步结果汇总:');
    console.log('============================');
    console.log(`✅ 成功: ${results.success.length} 个文件`);
    console.log(`❌ 失败: ${results.failed.length} 个文件`);
    console.log(`⏭️  跳过: ${results.skipped.length} 个文件`);
    if (results.githubSync.length > 0) {
      console.log(`🐙 GitHub同步: ${results.githubSync.length} 个文件`);
    }
    
    if (results.success.length > 0) {
      console.log('\n✅ 成功同步的文件:');
      results.success.forEach(result => {
        console.log(`   📁 ${result.folder}/${result.file} → ${result.s3Key} (${result.changed})`);
      });
    }
    
    if (results.githubSync.length > 0) {
      console.log('\n🐙 同步到GitHub的文件:');
      results.githubSync.forEach(result => {
        console.log(`   📁 ${result.folder}/${result.file} → ${result.path} (${result.commitSha})`);
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
    
    // 验证上传
    if (results.success.length > 0) {
      console.log('\n🔍 验证S3文件:');
      console.log('==============');
      try {
        const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
        
        for (const folder of folders) {
          const s3Prefix = environment === 'production' ? folder.s3_prefix_production : folder.s3_prefix_staging;
          const listCommand = new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: `${s3Prefix}/`
          });
          
          const listResult = await s3Client.send(listCommand);
          if (listResult.Contents && listResult.Contents.length > 0) {
            console.log(`\n📁 ${folder.name} (${s3Prefix}/):`);
            listResult.Contents.forEach(obj => {
              console.log(`   📄 ${obj.Key} (${obj.Size} bytes)`);
            });
          }
        }
      } catch (error) {
        console.error('   ⚠️  验证失败:', error.message);
      }
    }
    
    console.log('\n🚀 基于文件夹的智能同步完成！');
    console.log('🔄 同步方向: GitHub → S3 → GitHub master (只同步变更文件)');
    
    // 如果有失败的文件，返回错误状态
    if (results.failed.length > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ 基于文件夹的同步失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  syncFoldersToS3();
}

module.exports = { syncFoldersToS3 }; 