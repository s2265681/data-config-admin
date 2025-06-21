const fs = require('fs');
const path = require('path');

function generateS3Arns() {
  try {
    // 读取新的文件夹配置
    const configPath = path.join(process.cwd(), 'config', 'folders.json');
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    const bucket = 'rock-service-data';
    const arns = [];
    
    // 从文件夹配置生成ARN
    if (config.folders) {
      config.folders.forEach(folder => {
        // 为每个文件夹的staging和production环境生成ARN
        arns.push(`arn:aws:s3:::${bucket}/${folder.s3_prefix}/staging/*`);
        arns.push(`arn:aws:s3:::${bucket}/${folder.s3_prefix}/production/*`);
      });
    }
    
    return JSON.stringify(arns);
    
  } catch (error) {
    console.error('生成S3 ARN失败:', error);
    // 返回默认ARN
    return JSON.stringify([
      'arn:aws:s3:::rock-service-data/config/staging/*',
      'arn:aws:s3:::rock-service-data/config/production/*',
      'arn:aws:s3:::rock-service-data/config2/staging/*',
      'arn:aws:s3:::rock-service-data/config2/production/*',
      'arn:aws:s3:::rock-service-data/config3/staging/*',
      'arn:aws:s3:::rock-service-data/config3/production/*'
    ]);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  console.log(generateS3Arns());
} else {
  // 作为模块导出
  module.exports = generateS3Arns();
} 