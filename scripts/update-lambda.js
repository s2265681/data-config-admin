const { execSync } = require('child_process');
const ConfigManager = require('../utils/config-manager');

async function updateLambda() {
  try {
    console.log('🔄 快速更新Lambda函数...');
    console.log('======================');
    
    // 1. 验证配置
    console.log('\n1️⃣ 验证配置...');
    const configManager = new ConfigManager();
    const validation = configManager.validateConfig();
    
    if (!validation.isValid) {
      console.log('❌ 配置验证失败');
      process.exit(1);
    }
    
    console.log('✅ 配置验证通过');
    
    // 2. 只更新函数代码（不更新事件配置）
    console.log('\n2️⃣ 更新Lambda函数代码...');
    console.log('🔄 运行: serverless deploy function -f s3ToGithubMultiSync');
    
    try {
      execSync('serverless deploy function -f s3ToGithubMultiSync', { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      console.log('\n✅ Lambda函数更新成功！');
      
    } catch (error) {
      console.error('\n❌ 函数更新失败:', error.message);
      console.log('\n💡 尝试完整部署...');
      
      try {
        execSync('serverless deploy', { 
          stdio: 'inherit',
          cwd: process.cwd()
        });
        console.log('\n✅ 完整部署成功！');
      } catch (deployError) {
        console.error('\n❌ 完整部署也失败:', deployError.message);
        process.exit(1);
      }
    }
    
  } catch (error) {
    console.error('❌ 更新过程失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  updateLambda();
}

module.exports = { updateLambda }; 