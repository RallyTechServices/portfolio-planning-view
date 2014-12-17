Ext.define('Rally.technicalservices.data.ArtifactTree',{
    extend: 'Ext.data.TreeStore',
    logger: new Rally.technicalservices.Logger(),
    inputData: null,
    constructor: function(config) {
        config = Ext.apply({}, config);
        this.inputData = []; 
    },
    build: function(){
        this.logger.log('Rally.technicalservices.data.ArtifactTree.build', this.inputData);
    }
});