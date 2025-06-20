const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class FileManager {
  constructor() {
    this.configPath = path.join(process.cwd(), 'config', 'files.json');
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const configContent = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(configContent);
    } catch (error) {
      console.error('加载配置文件失败:', error);
      throw error;
    }
  }

  getFiles() {
    return this.config.files;
  }

  getFileByName(fileName) {
    return this.config.files.find(file => file.name === fileName);
  }

  getEnvironmentConfig(env) {
    return this.config.environments[env];
  }

  // 获取文件路径
  getFilePath(fileName, environment = 'staging') {
    const file = this.getFileByName(fileName);
    if (!file) {
      throw new Error(`文件 ${fileName} 未在配置中找到`);
    }
    return environment === 'production' ? file.production_path : file.staging_path;
  }

  // 检查文件是否存在
  fileExists(fileName) {
    const filePath = path.join(process.cwd(), fileName);
    return fs.existsSync(filePath);
  }

  // 读取文件内容
  readFile(fileName) {
    const filePath = path.join(process.cwd(), fileName);
    if (!this.fileExists(fileName)) {
      throw new Error(`文件 ${fileName} 不存在`);
    }
    return fs.readFileSync(filePath, 'utf8');
  }

  // 写入文件内容
  writeFile(fileName, content) {
    const filePath = path.join(process.cwd(), fileName);
    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf8');
  }

  // 计算文件哈希
  getFileHash(fileName) {
    const content = this.readFile(fileName);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  // 获取文件修改时间
  getFileModifiedTime(fileName) {
    const filePath = path.join(process.cwd(), fileName);
    const stats = fs.statSync(filePath);
    return stats.mtime;
  }

  // 检查文件是否发生变化
  hasFileChanged(fileName, previousHash) {
    try {
      const currentHash = this.getFileHash(fileName);
      return currentHash !== previousHash;
    } catch (error) {
      console.error(`检查文件 ${fileName} 变化时出错:`, error);
      return false;
    }
  }

  // 获取所有文件的状态
  getAllFilesStatus() {
    const status = {};
    this.config.files.forEach(file => {
      const fileName = file.name;
      status[fileName] = {
        exists: this.fileExists(fileName),
        modified: this.fileExists(fileName) ? this.getFileModifiedTime(fileName) : null,
        hash: this.fileExists(fileName) ? this.getFileHash(fileName) : null
      };
    });
    return status;
  }

  // 获取变更的文件列表
  getChangedFiles(previousHashes = {}) {
    const changedFiles = [];
    this.config.files.forEach(file => {
      const fileName = file.name;
      if (this.fileExists(fileName)) {
        const currentHash = this.getFileHash(fileName);
        const previousHash = previousHashes[fileName];
        
        if (!previousHash || currentHash !== previousHash) {
          changedFiles.push({
            name: fileName,
            path: file.staging_path,
            hash: currentHash,
            description: file.description
          });
        }
      }
    });
    return changedFiles;
  }

  // 验证JSON格式
  validateJsonFile(fileName) {
    try {
      const content = this.readFile(fileName);
      JSON.parse(content);
      return true;
    } catch (error) {
      console.error(`文件 ${fileName} JSON格式无效:`, error);
      return false;
    }
  }

  // 格式化JSON文件
  formatJsonFile(fileName) {
    try {
      const content = this.readFile(fileName);
      const parsed = JSON.parse(content);
      const formatted = JSON.stringify(parsed, null, 2);
      this.writeFile(fileName, formatted);
      return true;
    } catch (error) {
      console.error(`格式化文件 ${fileName} 失败:`, error);
      return false;
    }
  }

  // 获取文件名（不包含路径）
  getFileName(filePath) {
    return path.basename(filePath);
  }

  // 获取相对路径
  getRelativePath(filePath) {
    return path.relative(process.cwd(), filePath);
  }
}

module.exports = FileManager; 