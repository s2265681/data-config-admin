const FolderManager = require('../utils/folder-manager');
const fs = require('fs');
const path = require('path');

async function migrateToFolders() {
  try {
    console.log('🚀 开始迁移到文件夹结构...\n');
    
    const folderManager = new FolderManager();
    
    // 1. 验证文件夹配置
    console.log('📋 验证文件夹配置...');
    const validation = folderManager.validateFoldersConfig();
    if (!validation.isValid) {
      console.error('❌ 文件夹配置验证失败:');
      validation.errors.forEach(error => {
        console.error(`   - ${error}`);
      });
      process.exit(1);
    }
    console.log('✅ 文件夹配置验证通过\n');
    
    // 2. 创建文件夹结构
    console.log('📁 创建文件夹结构...');
    folderManager.createFolderStructure();
    console.log('');
    
    // 3. 迁移现有文件
    console.log('🔄 迁移现有文件...');
    folderManager.migrateFiles();
    console.log('');
    
    // 4. 生成文件夹报告
    console.log('📊 生成迁移报告...');
    folderManager.generateFolderReport();
    console.log('');
    
    // 5. 备份旧的files.json
    const oldFilesPath = path.join(process.cwd(), 'config', 'files.json');
    const backupPath = path.join(process.cwd(), 'config', 'files.json.backup');
    
    if (fs.existsSync(oldFilesPath)) {
      fs.copyFileSync(oldFilesPath, backupPath);
      console.log(`📦 已备份旧配置: ${backupPath}`);
    }
    
    // 6. 生成新的files.json（兼容性）
    console.log('🔄 生成兼容性files.json...');
    const filesList = folderManager.generateFilesList();
    const newFilesConfig = {
      files: filesList,
      environments: folderManager.getEnvironments(),
      monitoring: folderManager.getMonitoringConfig()
    };
    
    const newFilesPath = path.join(process.cwd(), 'config', 'files-new.json');
    fs.writeFileSync(newFilesPath, JSON.stringify(newFilesConfig, null, 2));
    console.log(`✅ 已生成新配置: ${newFilesPath}`);
    
    console.log('\n🎉 迁移完成！');
    console.log('\n📋 下一步操作:');
    console.log('1. 检查迁移后的文件结构是否正确');
    console.log('2. 测试新的同步功能');
    console.log('3. 如果一切正常，可以删除旧的文件');
    console.log('4. 更新相关脚本以使用新的文件夹管理器');
    
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateToFolders();
}

module.exports = { migrateToFolders }; 