# 地铁日常设施资产

状态：STATION-DETAIL-001 本地完成，整合进世界生成 PR。模型源自本项目原创程序建模，PBR表面源自既有world-surfaces原创配方；中文图面原创。无第三方艺术素材。

复建：`node node_modules/tsx/dist/cli.mjs scripts/station-detail/build.ts`。正式90个GLB内嵌颜色、法线、粗糙度贴图，外部PNG为复建中间文件，不依赖网络下载。

当前目录45类、90个GLB；样板间合计107项展品，新增六类空间组合。访问`/showroom.html?mode=asset&asset=cluster-rest`查看便民休息角，访问`/showroom.html?mode=asset&asset=prop-bin-double`查看垃圾桶及占地调试。

米制，Y向上，正面+Z，落地物原点在占地中心；墙面与顶面按目录安装点放置。门/柜门命名和轴心保留，当前只展示。共享资产尺寸、碰撞和使用空间由stationProps目录维护。
