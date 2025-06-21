const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class FolderManager {
  constructor() {
    this.foldersConfigPath = path.join(process.cwd(), 'config', 'folders.json');
    this.foldersConfig = this.loadFoldersConfig();
  }

  loadFoldersConfig() {
    try {
      const configContent = fs.readFileSync(this.foldersConfigPath, 'utf8');
      return JSON.parse(configContent);
    } catch (error) {
      console.error('加载文件夹配置失败:', error);
      throw error;
    }
  }

  // 获取所有文件夹配置
  getFolders() {
    return this.foldersConfig.folders;
  }

  // 根据文件夹名称获取配置
  getFolderByName(folderName) {
    return this.foldersConfig.folders.find(folder => folder.name === folderName);
  }

  // 获取环境配置
  getEnvironments() {
    return this.foldersConfig.environments;
  }

  // 获取监控配置
  getMonitoringConfig() {
    return this.foldersConfig.monitoring;
  }

  // 生成完整的文件列表（兼容旧的files.json格式）
  generateFilesList() {
    const files = [];
    
    this.foldersConfig.folders.forEach(folder => {
      folder.files.forEach(file => {
        const fileName = file.name;
        const localPath = path.join(folder.local_path, fileName);
        
        files.push({
          name: localPath,
          description: file.description,
          folder: folder.name,
          s3_prefix: folder.s3_prefix,
          staging_path: `${folder.s3_prefix}/staging/${fileName}`,
          production_path: `${folder.s3_prefix}/production/${fileName}`
        });
      });
    });
    
    return files;
  }

  // 检查文件夹是否存在
  folderExists(folderName) {
    const folder = this.getFolderByName(folderName);
    if (!folder) {
      return false;
    }
    const folderPath = path.join(process.cwd(), folder.local_path);
    return fs.existsSync(folderPath);
  }

  // 创建文件夹结构
  createFolderStructure() {
    console.log('📁 创建文件夹结构...');
    
    this.foldersConfig.folders.forEach(folder => {
      const folderPath = path.join(process.cwd(), folder.local_path);
      
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        console.log(`  ✅ 创建文件夹: ${folder.local_path}`);
      } else {
        console.log(`  ℹ️  文件夹已存在: ${folder.local_path}`);
      }
    });
    
    console.log('📁 文件夹结构创建完成！');
  }

  // 移动现有文件到新的文件夹结构
  migrateFiles() {
    console.log('🔄 开始迁移文件到新的文件夹结构...');
    
    const migrationMap = {
      'configuration/test.json': 'configuration/config/test.json',
      'configuration/test2.json': 'configuration/config2/test2.json', 
      'configuration/test3.json': 'configuration/config2/test3.json',
      'configuration/test4.json': 'configuration/config3/test4.json'
    };
    
    Object.entries(migrationMap).forEach(([source, target]) => {
      const sourcePath = path.join(process.cwd(), source);
      const targetPath = path.join(process.cwd(), target);
      
      if (fs.existsSync(sourcePath)) {
        // 确保目标目录存在
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        
        // 移动文件
        fs.renameSync(sourcePath, targetPath);
        console.log(`  ✅ 迁移: ${source} → ${target}`);
      } else {
        console.log(`  ⚠️  源文件不存在: ${source}`);
      }
    });
    
    console.log('🔄 文件迁移完成！');
  }

  // 检查文件是否存在
  fileExists(folderName, fileName) {
    const folder = this.getFolderByName(folderName);
    if (!folder) {
      return false;
    }
    const filePath = path.join(process.cwd(), folder.local_path, fileName);
    return fs.existsSync(filePath);
  }

  // 读取文件内容
  readFile(folderName, fileName) {
    const folder = this.getFolderByName(folderName);
    if (!folder) {
      throw new Error(`文件夹 ${folderName} 未在配置中找到`);
    }
    const filePath = path.join(process.cwd(), folder.local_path, fileName);
    if (!this.fileExists(folderName, fileName)) {
      throw new Error(`文件 ${fileName} 在文件夹 ${folderName} 中不存在`);
    }
    return fs.readFileSync(filePath, 'utf8');
  }

  // 写入文件内容
  writeFile(folderName, fileName, content) {
    const folder = this.getFolderByName(folderName);
    if (!folder) {
      throw new Error(`文件夹 ${folderName} 未在配置中找到`);
    }
    const filePath = path.join(process.cwd(), folder.local_path, fileName);
    
    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
  }

  // 计算文件哈希
  getFileHash(folderName, fileName) {
    const content = this.readFile(folderName, fileName);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  // 获取文件修改时间
  getFileModifiedTime(folderName, fileName) {
    const folder = this.getFolderByName(folderName);
    if (!folder) {
      throw new Error(`文件夹 ${folderName} 未在配置中找到`);
    }
    const filePath = path.join(process.cwd(), folder.local_path, fileName);
    const stats = fs.statSync(filePath);
    return stats.mtime;
  }

  // 获取所有文件的状态
  getAllFilesStatus() {
    const status = {};
    
    this.foldersConfig.folders.forEach(folder => {
      status[folder.name] = {};
      folder.files.forEach(file => {
        const fileName = file.name;
        status[folder.name][fileName] = {
          exists: this.fileExists(folder.name, fileName),
          modified: this.fileExists(folder.name, fileName) ? 
            this.getFileModifiedTime(folder.name, fileName) : null,
          hash: this.fileExists(folder.name, fileName) ? 
            this.getFileHash(folder.name, fileName) : null
        };
      });
    });
    
    return status;
  }

  // 获取变更的文件列表
  getChangedFiles(previousHashes = {}) {
    const changedFiles = [];
    
    this.foldersConfig.folders.forEach(folder => {
      folder.files.forEach(file => {
        const fileName = file.name;
        if (this.fileExists(folder.name, fileName)) {
          const currentHash = this.getFileHash(folder.name, fileName);
          const previousHash = previousHashes[folder.name]?.[fileName];
          
          if (!previousHash || currentHash !== previousHash) {
            changedFiles.push({
              folder: folder.name,
              name: fileName,
              localPath: path.join(folder.local_path, fileName),
              s3Path: `${folder.s3_prefix}/staging/${fileName}`,
              hash: currentHash,
              description: file.description
            });
          }
        }
      });
    });
    
    return changedFiles;
  }

  // 验证JSON格式
  validateJsonFile(folderName, fileName) {
    try {
      const content = this.readFile(folderName, fileName);
      JSON.parse(content);
      return true;
    } catch (error) {
      console.error(`文件 ${fileName} 在文件夹 ${folderName} 中JSON格式无效:`, error);
      return false;
    }
  }

  // 格式化JSON文件
  formatJsonFile(folderName, fileName) {
    try {
      const content = this.readFile(folderName, fileName);
      const parsed = JSON.parse(content);
      const formatted = JSON.stringify(parsed, null, 2);
      this.writeFile(folderName, fileName, formatted);
      return true;
    } catch (error) {
      console.error(`格式化文件 ${fileName} 在文件夹 ${folderName} 中失败:`, error);
      return false;
    }
  }

  // 添加新文件到文件夹
  addFileToFolder(folderName, fileName, description = '') {
    const folder = this.getFolderByName(folderName);
    if (!folder) {
      throw new Error(`文件夹 ${folderName} 未在配置中找到`);
    }
    
    // 检查文件是否已存在
    const existingFile = folder.files.find(file => file.name === fileName);
    if (existingFile) {
      throw new Error(`文件 ${fileName} 在文件夹 ${folderName} 中已存在`);
    }
    
    // 添加文件配置
    folder.files.push({
      name: fileName,
      description: description
    });
    
    // 保存配置
    this.saveFoldersConfig();
    
    console.log(`✅ 已添加文件 ${fileName} 到文件夹 ${folderName}`);
  }

  // 添加新文件夹
  addFolder(folderName, description, s3Prefix) {
    // 检查文件夹是否已存在
    const existingFolder = this.getFolderByName(folderName);
    if (existingFolder) {
      throw new Error(`文件夹 ${folderName} 已存在`);
    }
    
    // 添加文件夹配置
    this.foldersConfig.folders.push({
      name: folderName,
      description: description,
      local_path: `configuration/${folderName}`,
      s3_prefix: s3Prefix,
      files: []
    });
    
    // 保存配置
    this.saveFoldersConfig();
    
    console.log(`✅ 已添加文件夹 ${folderName}`);
  }

  // 保存文件夹配置
  saveFoldersConfig() {
    const configContent = JSON.stringify(this.foldersConfig, null, 2);
    fs.writeFileSync(this.foldersConfigPath, configContent, 'utf8');
  }

  // 验证文件夹配置
  validateFoldersConfig() {
    const errors = [];
    
    // 检查文件夹名称唯一性
    const folderNames = this.foldersConfig.folders.map(f => f.name);
    const duplicateNames = folderNames.filter((name, index) => folderNames.indexOf(name) !== index);
    if (duplicateNames.length > 0) {
      errors.push(`重复的文件夹名称: ${duplicateNames.join(', ')}`);
    }
    
    // 检查S3前缀唯一性
    const s3Prefixes = this.foldersConfig.folders.map(f => f.s3_prefix);
    const duplicatePrefixes = s3Prefixes.filter((prefix, index) => s3Prefixes.indexOf(prefix) !== index);
    if (duplicatePrefixes.length > 0) {
      errors.push(`重复的S3前缀: ${duplicatePrefixes.join(', ')}`);
    }
    
    // 检查文件名称唯一性
    const allFileNames = [];
    this.foldersConfig.folders.forEach(folder => {
      folder.files.forEach(file => {
        allFileNames.push(`${folder.name}/${file.name}`);
      });
    });
    const duplicateFileNames = allFileNames.filter((name, index) => allFileNames.indexOf(name) !== index);
    if (duplicateFileNames.length > 0) {
      errors.push(`重复的文件名称: ${duplicateFileNames.join(', ')}`);
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  // 生成文件夹结构报告
  generateFolderReport() {
    console.log('📊 文件夹结构报告:');
    console.log('==================');
    
    this.foldersConfig.folders.forEach(folder => {
      console.log(`\n📁 ${folder.name} (${folder.description})`);
      console.log(`   本地路径: ${folder.local_path}`);
      console.log(`   S3前缀: ${folder.s3_prefix}`);
      console.log(`   文件数量: ${folder.files.length}`);
      
      if (folder.files.length > 0) {
        console.log('   文件列表:');
        folder.files.forEach(file => {
          const exists = this.fileExists(folder.name, file.name);
          console.log(`     ${exists ? '✅' : '❌'} ${file.name} - ${file.description}`);
        });
      }
    });
    
    // 验证配置
    const validation = this.validateFoldersConfig();
    if (!validation.isValid) {
      console.log('\n⚠️  配置验证错误:');
      validation.errors.forEach(error => {
        console.log(`   - ${error}`);
      });
    } else {
      console.log('\n✅ 配置验证通过');
    }
  }
}

module.exports = FolderManager; 