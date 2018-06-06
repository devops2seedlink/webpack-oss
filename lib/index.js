const co = require('co')
const oss = require('ali-oss')
const chalk = require('chalk')
const _ = require('lodash')
const red = chalk.red
const green = chalk.bold.green

module.exports = class WebpackAliOSSPlugin {
  constructor (cfg) {
    this.store = null
    this.config = {
	auth: {
	accessKeyId: '',
	accessKeySecret: '',
	bucket: '',
	region: ''
	},
	prefix: '',
	enableLog: '',
	ignoreError: false,
	removeMode: true,
	deleteAll: false
	}
    this.config.auth.accessKeyId = cfg.accessKeyId || process.env.WEBPACK_ALIOSS_PLUGIN_ACCESS_KEY_ID
    this.config.auth.accessKeySecret = cfg.accessKeySecret || process.env.WEBPACK_ALIOSS_PLUGIN_ACCESS_KEY_SECRET
    this.config.auth.bucket = cfg.bucket || process.env.WEBPACK_ALIOSS_PLUGIN_BUCKET
    this.config.auth.region = cfg.region || process.env.WEBPACK_ALIOSS_PLUGIN_REGION
    this.config.prefix = cfg.prefix.endsWith('/') ? cfg.prefix : `${cfg.prefix}/`
    this.config.exclude = cfg.exclude && cfg.exclude !== '' ? cfg.exclude : undefined
    this.config.ignoreError = cfg.ignoreError ? cfg.ignoreError : false
    this.config.enableLog = cfg.enableLog === false ? cfg.enableLog : true
    this.config.removeMode = cfg.deleteMode === false ? cfg.deleteMode : true,
    this.config.deleteAll = cfg.deleteAll ? cfg.deleteAll : false;
  }

  apply (compiler) {
    this.store = oss(this.config.auth);



    compiler.plugin('after-emit', (compilation, cb) => {
    if (this.config.deleteAll) {
      co(function* (){
        var result = yield this.store.list({
          prefix: this.config.prefix
        });
        if (result.objects) {
          result = result.objects.map(function (file) {
            return file.name;
          });
        }
        yield this.store.deleteMulti(result, {
          quiet: true
        });
      }.bind(this))
    }

      this.uploadFiles(compilation)
        .then(() => {
          cb()
        })
        .catch((err) => {
          console.log('\n')
          console.log(`${red('OSS 上传出错')}:::: ${red(err.name)}-${red(err.code)}: ${red(err.message)}`)
          if (this.config.ignoreError) {
            cb()
          } else {
            compilation.errors.push(err)
            cb()
          }
        })
    })
  }

  logInfo (str) {
    !this.config.enableLog || console.log(str)
  }

  uploadFiles (compilation) {
    let uploadIndex = 0
      const files = this.getAssetsFiles(compilation)
      return Promise.all(files.map((file, index, arr) => {
        return this.uploadFile(file.name, file)
          .then((result) => {
            if (uploadIndex++ === 0) {
              this.logInfo(green('\n\n OSS 上传中......'))
            }
            this.logInfo(`上传成功: ${file.name}`)
            if (files.length === uploadIndex) {
              this.logInfo(green('OSS 上传完成\n'))
            }
            !this.config.removeMode || delete compilation.assets[file.name]
            Promise.resolve('上传成功')
          }, (e) => {
            return Promise.reject(e)
          })
      }))
  }
  uploadFile (name, assetObj) {
    return co(function *() {
      const uploadName = `${this.config.prefix}${name}`
      return yield this.store.put(uploadName, Buffer.from(assetObj.content))
    }.bind(this))
  }

  getAssetsFiles ({assets}) {
    let items = _.reduce(assets, (res, value, name) => {
      let file = {name, path: value.existsAt, content: value.source()}
      if (this.config.exclude === undefined){
          res.push(file)
      }else{
         if (!this.config.exclude.test(file.name)) {
             res.push(file)
         }
      }
      return res
    }, [])
    const newItems = []
    for (const item of items) {
      if (item && item.name) {
        newItems.push(item)
      }
    }
    return newItems
  }
}
