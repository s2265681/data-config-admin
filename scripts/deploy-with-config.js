const { execSync } = require('child_process');
const ConfigManager = require('../utils/config-manager');

async function deployWithConfig() {
  try {
    console.log('🚀 开始配置验证和部署...');
    console.log('========================');
    
    // 1. 验证配置
    console.log('\n1️⃣ 验证配置文件...');
    const configManager = new ConfigManager();
    const validation = configManager.validateConfig();
    
    if (!validation.isValid) {
      console.log('❌ 配置验证失败:');
      validation.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
      process.exit(1);
    }
    
    console.log('✅ 配置验证通过');
    
    // 2. 显示配置摘要
    console.log('\n2️⃣ 配置摘要:');
    configManager.generateMonitoringSummary();
    
    // 3. 生成S3 ARN
    console.log('\n3️⃣ 生成S3资源ARN...');
    const generateS3Arns = require('../utils/generate-s3-arns.js');
    const arns = JSON.parse(generateS3Arns);
    console.log('📋 S3资源ARN:');
    arns.forEach((arn, index) => {
      console.log(`   ${index + 1}. ${arn}`);
    });
    
    // 4. 询问用户是否继续
    console.log('\n4️⃣ 准备部署...');
    console.log('📝 这将更新AWS Lambda函数和S3事件配置');
    console.log('⚠️  注意: 如果Lambda函数正在运行，可能会有短暂的中断');
    
    // 5. 执行部署
    console.log('\n5️⃣ 开始部署...');
    console.log('🔄 运行: serverless deploy');
    
    try {
      execSync('serverless deploy', { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      console.log('\n✅ 部署成功！');
      console.log('\n📋 部署后的监控路径:');
      const monitoringPaths = configManager.getS3MonitoringPaths();
      monitoringPaths.forEach((path, index) => {
        console.log(`   ${index + 1}. ${path.prefix}*.json (${path.environment})`);
      });
      
    } catch (error) {
      console.error('\n❌ 部署失败:', error.message);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ 部署过程失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  deployWithConfig();
}

module.exports = { deployWithConfig }; 