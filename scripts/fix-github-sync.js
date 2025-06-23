const { Octokit } = require('@octokit/rest');
const { execSync } = require('child_process');

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

async function fixGitHubSync() {
  try {
    console.log('🔧 开始修复GitHub同步问题...');
    
    // 验证环境变量
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN 环境变量未设置');
    }
    if (!process.env.GITHUB_REPO) {
      throw new Error('GITHUB_REPO 环境变量未设置');
    }
    
    const [owner, repo] = process.env.GITHUB_REPO.split('/');
    console.log(`📁 GitHub仓库: ${owner}/${repo}`);
    
    // 获取当前分支
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    console.log(`🌿 当前分支: ${currentBranch}`);
    
    // 获取远程main分支的最新SHA
    console.log('📋 获取远程main分支信息...');
    const { data: mainRef } = await octokit.git.getRef({
      owner,
      repo,
      ref: 'heads/main'
    });
    
    const remoteMainSha = mainRef.object.sha;
    console.log(`📋 远程main分支SHA: ${remoteMainSha.substring(0, 8)}...`);
    
    // 获取本地main分支的SHA（如果存在）
    let localMainSha = null;
    try {
      const { data: localRef } = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${currentBranch}`
      });
      localMainSha = localRef.object.sha;
      console.log(`📋 本地${currentBranch}分支SHA: ${localMainSha.substring(0, 8)}...`);
    } catch (error) {
      console.log(`📋 本地${currentBranch}分支不存在，将创建新分支`);
    }
    
    // 检查是否需要强制更新
    if (localMainSha && localMainSha !== remoteMainSha) {
      console.log('⚠️  检测到分支不同步，需要强制更新');
      
      // 获取远程main分支的最新提交
      const { data: mainCommit } = await octokit.git.getCommit({
        owner,
        repo,
        commit_sha: remoteMainSha
      });
      
      console.log(`📝 远程main分支最新提交: ${mainCommit.message.split('\n')[0]}`);
      
      // 强制更新本地分支到远程main分支
      await octokit.git.updateRef({
        owner,
        repo,
        ref: `heads/${currentBranch}`,
        sha: remoteMainSha,
        force: true
      });
      
      console.log(`✅ 成功强制更新${currentBranch}分支到远程main分支`);
    } else {
      console.log('✅ 分支已同步，无需更新');
    }
    
    // 验证更新结果
    const { data: updatedRef } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${currentBranch}`
    });
    
    console.log(`📋 更新后${currentBranch}分支SHA: ${updatedRef.object.sha.substring(0, 8)}...`);
    console.log('✅ GitHub同步问题修复完成！');
    
  } catch (error) {
    console.error('❌ 修复GitHub同步失败:', error.message);
    if (error.response) {
      console.error('📋 GitHub API状态:', error.response.status);
      console.error('📋 GitHub API响应:', error.response.data);
    }
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  fixGitHubSync();
}

module.exports = { fixGitHubSync }; 