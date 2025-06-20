



1、files.json 配置说明

files.json 是数据配置管理的核心配置文件，用于定义需要管理的配置文件及其在不同环境下的路径。

2、文件定义

每个文件都需要定义以下信息：

- name: 配置文件的名称，包括路径（例如 configuration/test.json）。
- description: 配置文件的描述，用于理解其用途。
- staging_path: 配置文件在 Staging 环境中的路径，用于 Staging 分支。
- production_path: 配置文件在 Production 环境中的路径，用于 Main 分支。

3、监控路径定义

在 monitoring 部分定义需要监控的 S3 路径，包括前缀、后缀和对应的环境。

- prefix: S3 路径的前缀，用于匹配需要监控的对象。
- suffix: S3 路径的后缀，用于匹配需要监控的对象。
- environment: 监控的环境，对应 files.json 中的环境定义。


