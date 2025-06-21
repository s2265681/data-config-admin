const { execSync } = require('child_process');
const FolderManager = require('../utils/folder-manager');

async function deploy() {
  try {
    console.log('🚀 开始部署配置管理系统...\n');
    
    // 1. 验证文件夹配置
    console.log('📋 验证文件夹配置...');
    const folderManager = new FolderManager();
    const validation = folderManager.validateFoldersConfig();
    
    if (!validation.isValid) {
      console.error('❌ 配置验证失败:');
      validation.errors.forEach(error => {
        console.error(`   - ${error}`);
      });
      process.exit(1);
    }
    console.log('✅ 配置验证通过\n');
    
    // 2. 显示部署信息
    console.log('📊 部署信息:');
    console.log('============');
    const folders = folderManager.getFolders();
    folders.forEach(folder => {
      console.log(`📁 ${folder.name}: ${folder.description}`);
      console.log(`   本地路径: ${folder.local_path}`);
      console.log(`   S3前缀: ${folder.s3_prefix}`);
      console.log(`   文件数量: ${folder.files.length}`);
      console.log('');
    });
    
    // 3. 执行部署
    console.log('🔄 执行Serverless部署...');
    execSync('serverless deploy', { stdio: 'inherit' });
    
    console.log('\n✅ 部署完成！');
    console.log('\n📋 下一步操作:');
    console.log('1. 测试同步功能: npm run sync-folders-to-s3');
    console.log('2. 监控同步状态: npm run monitor-folders-sync');
    console.log('3. 查看Lambda日志: serverless logs -f s3ToGithubSync --tail');
    
  } catch (error) {
    console.error('❌ 部署失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  deploy();
}

module.exports = { deploy }; 