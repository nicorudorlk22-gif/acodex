function FileDiff(params) {
	import(/* webpackChunkName: "fileDiff" */ "./fileDiff").then((res) => {
		res.default(params);
	});
}
export default FileDiff;
