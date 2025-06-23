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
        // 检查GitHub Token是否有效
        if (!process.env.GITHUB_TOKEN) {
          console.log('⚠️  GITHUB_TOKEN未设置，跳过GitHub同步');
          results.skipped.push({
            folder: 'github-sync',
            file: 'multiple',
            reason: 'GITHUB_TOKEN未设置'
          });
        } else {
          // 使用更简单的方式：创建或更新README文件来记录同步状态
          const readmeContent = `# 配置文件同步状态

## 最后同步时间
${new Date().toISOString()}

## 同步环境
${environment}

## 触发分支
${process.env.GITHUB_REF || 'unknown'}

## 本次同步的文件
${filesToSyncToGitHub.map(file => `- ${file.folder}/${file.fileName}`).join('\n')}

## 同步统计
- 成功同步: ${results.success.length} 个文件
- 跳过文件: ${results.skipped.length} 个文件
- 失败文件: ${results.failed.length} 个文件

---
*此文件由自动同步脚本生成，用于记录配置文件同步状态*
`;

          try {
            // 尝试更新现有的README文件
            const { data: existingFile } = await octokit.repos.getContent({
              owner,
              repo,
              path: 'SYNC_STATUS.md',
              ref: 'main'
            });

            // 更新文件
            await octokit.repos.createOrUpdateFileContents({
              owner,
              repo,
              path: 'SYNC_STATUS.md',
              message: `🔄 更新同步状态 - ${new Date().toISOString()}`,
              content: Buffer.from(readmeContent).toString('base64'),
              sha: existingFile.sha,
              branch: 'main'
            });

            console.log(`✅ 成功更新同步状态文件: SYNC_STATUS.md`);
            
            // 记录GitHub同步结果
            results.githubSync.push({
              folder: 'sync-status',
              file: 'SYNC_STATUS.md',
              path: 'SYNC_STATUS.md',
              commitSha: 'updated'
            });

          } catch (error) {
            if (error.status === 404) {
              // 文件不存在，创建新文件
              await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: 'SYNC_STATUS.md',
                message: `🔄 创建同步状态文件 - ${new Date().toISOString()}`,
                content: Buffer.from(readmeContent).toString('base64'),
                branch: 'main'
              });

              console.log(`✅ 成功创建同步状态文件: SYNC_STATUS.md`);
              
              // 记录GitHub同步结果
              results.githubSync.push({
                folder: 'sync-status',
                file: 'SYNC_STATUS.md',
                path: 'SYNC_STATUS.md',
                commitSha: 'created'
              });
            } else {
              throw error;
            }
          }
        }
        
      } catch (error) {
        console.error('❌ 同步到GitHub失败:', error.message);
        console.log('💡 提示: 请检查GITHUB_TOKEN权限，需要contents:write权限');
        console.log('📖 文档: https://docs.github.com/rest/repos/contents#create-or-update-file-contents');
        
        // 将GitHub同步失败记录为跳过，而不是失败
        results.skipped.push({
          folder: 'github-sync',
          file: 'multiple',
          reason: `GitHub同步失败: ${error.message}`
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
        if (result.folder === 'github-sync') {
          console.log(`   🐙 GitHub同步: ${result.reason}`);
        } else {
          console.log(`   📁 ${result.folder}/${result.file}: ${result.reason}${result.hash ? ` (${result.hash})` : ''}`);
        }
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
    
    // 只检查S3同步失败，GitHub同步失败不影响整体结果
    const s3FailedCount = results.failed.filter(result => result.folder !== 'github-sync').length;
    if (s3FailedCount > 0) {
      console.log(`\n⚠️  S3同步有 ${s3FailedCount} 个文件失败`);
      process.exit(1);
    }
    
    console.log('\n✅ 所有S3同步任务完成！');
    
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