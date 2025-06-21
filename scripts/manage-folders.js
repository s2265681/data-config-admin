const FolderManager = require('../utils/folder-manager');

async function manageFolders() {
  const folderManager = new FolderManager();
  const command = process.argv[2];
  const args = process.argv.slice(3);
  
  try {
    switch (command) {
      case 'report':
        await generateReport(folderManager);
        break;
        
      case 'create-structure':
        await createStructure(folderManager);
        break;
        
      case 'migrate':
        await migrateFiles(folderManager);
        break;
        
      case 'add-folder':
        if (args.length < 3) {
          console.error('❌ 用法: node manage-folders.js add-folder <folder-name> <description> <s3-prefix>');
          process.exit(1);
        }
        await addFolder(folderManager, args[0], args[1], args[2]);
        break;
        
      case 'add-file':
        if (args.length < 3) {
          console.error('❌ 用法: node manage-folders.js add-file <folder-name> <file-name> <description>');
          process.exit(1);
        }
        await addFile(folderManager, args[0], args[1], args[2]);
        break;
        
      case 'validate':
        await validateConfig(folderManager);
        break;
        
      case 'list':
        await listFolders(folderManager);
        break;
        
      case 'list-files':
        if (args.length < 1) {
          console.error('❌ 用法: node manage-folders.js list-files <folder-name>');
          process.exit(1);
        }
        await listFiles(folderManager, args[0]);
        break;
        
      default:
        showHelp();
        break;
    }
  } catch (error) {
    console.error('❌ 操作失败:', error.message);
    process.exit(1);
  }
}

async function generateReport(folderManager) {
  console.log('📊 生成文件夹结构报告...\n');
  folderManager.generateFolderReport();
}

async function createStructure(folderManager) {
  console.log('📁 创建文件夹结构...\n');
  folderManager.createFolderStructure();
}

async function migrateFiles(folderManager) {
  console.log('🔄 迁移文件到新的文件夹结构...\n');
  folderManager.migrateFiles();
}

async function addFolder(folderManager, folderName, description, s3Prefix) {
  console.log(`📁 添加新文件夹: ${folderName}`);
  console.log(`   描述: ${description}`);
  console.log(`   S3前缀: ${s3Prefix}\n`);
  
  folderManager.addFolder(folderName, description, s3Prefix);
  folderManager.createFolderStructure();
  
  console.log(`✅ 文件夹 ${folderName} 添加成功！`);
}

async function addFile(folderManager, folderName, fileName, description) {
  console.log(`📄 添加新文件到文件夹: ${folderName}`);
  console.log(`   文件名: ${fileName}`);
  console.log(`   描述: ${description}\n`);
  
  folderManager.addFileToFolder(folderName, fileName, description);
  
  console.log(`✅ 文件 ${fileName} 已添加到文件夹 ${folderName}！`);
}

async function validateConfig(folderManager) {
  console.log('🔍 验证文件夹配置...\n');
  
  const validation = folderManager.validateFoldersConfig();
  if (validation.isValid) {
    console.log('✅ 配置验证通过');
  } else {
    console.log('❌ 配置验证失败:');
    validation.errors.forEach(error => {
      console.log(`   - ${error}`);
    });
    process.exit(1);
  }
}

async function listFolders(folderManager) {
  console.log('📁 文件夹列表:');
  console.log('==============');
  
  const folders = folderManager.getFolders();
  folders.forEach(folder => {
    console.log(`\n📁 ${folder.name}`);
    console.log(`   描述: ${folder.description}`);
    console.log(`   本地路径: ${folder.local_path}`);
    console.log(`   S3前缀: ${folder.s3_prefix}`);
    console.log(`   文件数量: ${folder.files.length}`);
  });
}

async function listFiles(folderManager, folderName) {
  console.log(`📄 文件夹 ${folderName} 中的文件:`);
  console.log('========================');
  
  const folder = folderManager.getFolderByName(folderName);
  if (!folder) {
    console.error(`❌ 文件夹 ${folderName} 不存在`);
    process.exit(1);
  }
  
  if (folder.files.length === 0) {
    console.log('   暂无文件');
    return;
  }
  
  folder.files.forEach(file => {
    const exists = folderManager.fileExists(folderName, file.name);
    console.log(`   ${exists ? '✅' : '❌'} ${file.name} - ${file.description}`);
  });
}

function showHelp() {
  console.log('📁 文件夹管理工具');
  console.log('==================');
  console.log('');
  console.log('用法: node manage-folders.js <command> [args]');
  console.log('');
  console.log('命令:');
  console.log('  report                   生成文件夹结构报告');
  console.log('  create-structure         创建文件夹结构');
  console.log('  migrate                  迁移现有文件到新结构');
  console.log('  validate                 验证文件夹配置');
  console.log('  list                     列出所有文件夹');
  console.log('  list-files <folder>      列出指定文件夹中的文件');
  console.log('  add-folder <name> <desc> <s3-prefix>    添加新文件夹');
  console.log('  add-file <folder> <file> <desc>         添加新文件到文件夹');
  console.log('');
  console.log('示例:');
  console.log('  node manage-folders.js report');
  console.log('  node manage-folders.js add-folder "database" "数据库配置" "db-config"');
  console.log('  node manage-folders.js add-file "database" "mysql.json" "MySQL数据库配置"');
  console.log('  node manage-folders.js list-files "config"');
}

// 如果直接运行此脚本
if (require.main === module) {
  manageFolders();
}

module.exports = { manageFolders }; 