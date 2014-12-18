Ext.define('Rally.technicalservices.data.ArtifactTreeModel',{
    extend: 'Ext.data.Model',
    fields: [
        { name: 'FormattedID', type: 'String' },
        { name: 'Name', type:'String' },
        { name: '_ref', type:'String' },
        { name: '_type', type:'String' }
    ]
});

Ext.define('Rally.technicalservices.data.ArtifactTree',{
    extend: 'Ext.data.TreeStore',
    requires: ['Rally.technicalservices.util.TreeBuilding'],
    logger: new Rally.technicalservices.Logger(),
    inputData: null,
    parentField: 'Feature',
    releaseStartDate: null,
    releaseEndDate: null, 
    constructor: function(config) {
        this.config = Ext.apply({}, config);
        this.inputData = []; 
    },
    build: function(){
        this.logger.log('Rally.technicalservices.data.ArtifactTree.build', this.inputData);
        var model_hash = Rally.technicalservices.util.TreeBuilding.prepareModelHash(this.inputData, this.parentField);
        var iterations = this._getIterations(model_hash,this.releaseStartDate, this.releaseEndDate);
        
        this.logger.log(iterations);
        iterations['Unscheduled'] = {Name: 'Unscheduled'};
        iterations['OutsideReleaseWindow'] = {Name: 'Outside Release Window'};
        
        model_hash = this._addColumnsAndBucketData(model_hash, iterations);
        var root_array = Rally.technicalservices.util.TreeBuilding.constructRootItems(model_hash);
        this.logger.log('build: root_array',root_array);
        
        var model_config = {
                extend: 'Rally.technicalservices.data.ArtifactTreeModel',
                fields: Object.keys(iterations)
        };
        
        Ext.define('TSIterationTreeModelWithAdditions', model_config);
        this.model = TSIterationTreeModelWithAdditions;
        this.root = {expanded: false, children: root_array};
        
        this.columns = this._buildColumns(iterations);
    },
    _getIterations: function(model_hash, releaseStartDate, releaseEndDate){
        var iterations = {};  
        Ext.Object.each(model_hash, function(model){
            var iteration = model_hash[model].get('Iteration');
            if (iteration){
                var key = iteration.Name; //Assumes Name is unique and all itertions with the same name ahve the same start and end dates
                console.log(key,Ext.Array.contains(Object.keys(iterations),key),this._dateWithinRange(iteration.StartDate, iteration.EndDate, releaseStartDate, releaseEndDate));
                if (key.length > 0 && !Ext.Array.contains(Object.keys(iterations),key) && 
                        (this._dateWithinRange(iteration.StartDate, iteration.EndDate, releaseStartDate, releaseEndDate))){
                    iterations[key]={Name: iteration.Name, StartDate: iteration.StartDate, EndDate: iteration.EndDate};
                }
            }
        },this);
        return iterations; 
    },
    _dateWithinRange: function(startDate, endDate, rangeStartDate, rangeEndDate){
        var start = Rally.util.DateTime.fromIsoString(startDate);
        var end = Rally.util.DateTime.fromIsoString(endDate);
        var rangeStart = Rally.util.DateTime.fromIsoString(rangeStartDate);
        var rangeEnd = Rally.util.DateTime.fromIsoString(rangeEndDate);
        this.logger.log('_dateWithinRange', start, end, rangeStart, rangeEnd,(start < rangeEndDate && end > rangeStartDate) );
        return (start < rangeEndDate && end > rangeStartDate);
    },
    _addColumnsAndBucketData: function(model_hash,iterations){
        Ext.Object.each(model_hash, function(key, model){
            Ext.Object.each(iterations, function(ikey, iteration){
                model.set(iteration.Name, 0);
            });
            var model_iteration = 'Unscheduled';
            if (model.get('Iteration')){
                model_iteration = 'OutsideReleaseWindow';
                if (Ext.Array.contains(Object.keys(iterations),model.get('Iteration').Name)){
                    model_iteration = model.get('Iteration').Name;
                }
            }
            if (model.get('PlanEstimate')){
                model[model_iteration]= model.get('PlanEstimate');
            } 
        });
        return model_hash; 
    },
    _buildColumns: function(iterations){
        var columns = [
                       {
                           xtype: 'treecolumn',
                           text: 'Item',
                           dataIndex: 'ObjectID',
                           itemId: 'tree_column',
                           renderer: function(v,m,r){
                               return r.get('FormattedID') + ': ' + r.get('Name');
                           },
                           width: 400,
                           menuDisabled: true
                       }];
        return columns; 
    }
});