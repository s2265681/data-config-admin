const { execSync } = require('child_process');

async function updateLambda() {
  try {
    console.log('🔄 更新Lambda函数...\n');
    
    // 获取函数名称
    const functionName = process.argv[2] || 's3ToGithubSync';
    
    console.log(`📋 更新函数: ${functionName}`);
    console.log('===============');
    
    // 执行更新
    execSync(`serverless deploy function -f ${functionName}`, { stdio: 'inherit' });
    
    console.log('\n✅ Lambda函数更新完成！');
    console.log('\n📋 查看日志:');
    console.log(`serverless logs -f ${functionName} --tail`);
    
  } catch (error) {
    console.error('❌ Lambda更新失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  updateLambda();
}

module.exports = { updateLambda }; 