const ConfigManager = require('../utils/config-manager');

async function validateConfiguration() {
  try {
    console.log('🔍 开始验证配置文件...');
    console.log('====================');
    
    const configManager = new ConfigManager();
    
    // 验证配置
    const validation = configManager.validateConfig();
    
    if (validation.isValid) {
      console.log('✅ 配置验证通过！');
    } else {
      console.log('❌ 配置验证失败:');
      validation.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
      process.exit(1);
    }
    
    // 显示监控配置摘要
    configManager.generateMonitoringSummary();
    
    // 显示环境配置
    console.log('\n🌍 环境配置:');
    console.log('============');
    const environments = configManager.getEnvironments();
    Object.keys(environments).forEach(env => {
      const config = environments[env];
      console.log(`${env}:`);
      console.log(`   S3前缀: ${config.s3_prefix}`);
      console.log(`   GitHub分支: ${config.github_branch}`);
    });
    
    // 显示监控路径
    console.log('\n📋 监控路径详情:');
    console.log('================');
    const monitoringPaths = configManager.getS3MonitoringPaths();
    monitoringPaths.forEach((path, index) => {
      console.log(`${index + 1}. ${path.prefix}*.json`);
      console.log(`   环境: ${path.environment}`);
      console.log(`   后缀: ${path.suffix}`);
    });
    
    // 测试路径匹配
    console.log('\n🧪 路径匹配测试:');
    console.log('================');
    const testPaths = [
      'config/staging/test.json',
      'config2/staging/test2.json',
      'config/production/test.json',
      'config2/production/test3.json',
      'config/other/file.txt',
      'other/path/test.json'
    ];
    
    testPaths.forEach(testPath => {
      const result = configManager.isPathMonitored(testPath);
      if (result.monitored) {
        console.log(`✅ ${testPath} -> ${result.environment} (${result.prefix})`);
      } else {
        console.log(`❌ ${testPath} -> 不在监控范围内`);
      }
    });
    
    console.log('\n🎉 配置验证完成！');
    
  } catch (error) {
    console.error('❌ 配置验证失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  validateConfiguration();
}

module.exports = { validateConfiguration }; 