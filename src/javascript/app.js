Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    CHUNK_SIZE: 10,
    items: [
        {xtype:'container',itemId:'criteria_box', layout: {type: 'hbox'}, padding: 10},
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    portfolioItemType: 'PortfolioItem/Feature',
    portfolioItemFilterField: 'c_FeatureType',
    portfolioItemTypeFetchFields: ['ObjectID','FormattedID','Name'],
    userStoryFetchFields: ['ObjectID','FormattedID','Name','Feature','PlanEstimate','Iteration','Name'],
    unscheduledFieldName: 'Unscheduled',
    outsideReleaseFieldName: 'OutsideRelease',
    launch: function() {

        this.cbRelease = this.down('#criteria_box').add({
            xtype:'rallyreleasecombobox',
            fieldLabel: 'Release',
            labelAlign: 'right',
            width: 350,
            storeConfig: {
                context: {projectScopeDown: false}
            },
            margin: 10
        }); 
        
        var ff_label = this.portfolioItemFilterField.replace(/^c_/,"");
        this.cbFeatureFilter = this.down('#criteria_box').add({
            xtype: 'rallyfieldvaluecombobox',
            model: this.portfolioItemType,
            field: this.portfolioItemFilterField,
            fieldLabel: ff_label,
            labelAlign: 'right',
            forceSelection: false,
            allowNoEntry: true,
            margin: 10
        });
        
        this.down('#criteria_box').add({
            xtype: 'rallybutton',
            text: 'Apply',
            scope: this,
            handler: this._run,
            margin: 10
        });
    },
    _run: function(){
        var release_filter = this.cbRelease.getQueryFromSelected();
        var feature_filter = this.cbFeatureFilter.getValue();
        this.logger.log('_run: release_filter', release_filter.toString(), 'feature_filter', feature_filter,this.cbRelease.getRecord().get('ReleaseStartDate'));
        this.setLoading(true);
        
        var release_start_date = this.cbRelease.getRecord().get('ReleaseStartDate');
        var release_end_date = this.cbRelease.getRecord().get('ReleaseDate');
        
        this._fetchPortfolioItems(release_filter, feature_filter).then({
            scope: this,
            success: function(pi_data){
                this.logger.log('fetchPortfolioItems success', pi_data);
                this._fetchUserStories(pi_data).then({
                    scope: this,
                    success: function(user_story_data){
                        this.logger.log('fetchUserStories success', user_story_data);
                        this._fetchIterations(release_start_date, release_end_date, this.unscheduledFieldName, this.outsideReleaseFieldName).then({
                            scope: this,
                            success: function(){
                                this.logger.log('_fetchIterations', this.iterationMap);
                                var columns = this._constructColumns();
                                
                                var inputData = [pi_data, user_story_data];
                                var root = this.buildRoot(this._getPortfolioItemFieldName(),inputData,this.unscheduledFieldName,this.outsideReleaseFieldName);
                                
                                var model_fields = [];
                                model_fields.push({name: 'FormattedID'});
                                model_fields.push({name: 'Name'});
                                Ext.each(Object.keys(this.iterationMap), function(key){
                                    model_fields.push({name: key});
                                });
                                model_fields.push({name: this.unscheduledFieldName});
                                model_fields.push({name: this.outsideReleaseFieldName});
                                
                                Ext.define('IterationTreeModel', {
                                    extend: 'Ext.data.Model',
                                    fields: model_fields
                                });
                                
                                var treeStore = Ext.create('Ext.data.TreeStore',{
                                    model: IterationTreeModel,
                                    root: {expanded: true, children: root}
                                });
                                this._createTree(treeStore, columns);
                                this.setLoading(false);
                            },
                            failure: function(error){
                                this.logger.log('_fetchIterations return error', error);
                                this.setLoading(false);
                            }
                        });
                    },
                    failure: function(error){
                        this.logger.log('_fetchUserStories return error',error);
                        this.setLoading(false);
                    }
                });
            },
            failure: function(error){
                this.logger.log('_fetchPortfolioItems return error',error);
                this.setLoading(false);
            }
        });
    },
    _fetchPortfolioItems: function(release_filter, feature_filter){
        var deferred = Ext.create('Deft.Deferred');

        var filters = release_filter;  
        if (feature_filter){
            filters = filters.and(Ext.create('Rally.data.wsapi.Filter',{
                property: this.portfolioItemFilterField,
                value: feature_filter
            }));
        }
        this.logger.log('_fetchPortfolioItems',filters.toString());
        this._createWsapiStore(this.portfolioItemType, this.portfolioItemTypeFetchFields, filters).then({
            scope: this,
            success: function(data){
                deferred.resolve(data);
            },
            failure: function(error){
                this.logger.log('_fetchPortfolioItems _createStore failed', error);
            }
        });

        return deferred;  
    },
    _getPortfolioItemFieldName: function(){
        return 'Feature';
    },
    _fetchUserStories: function(portfolio_items_data){
        this.logger.log('_fetchUserStories', portfolio_items_data);
        var deferred = Ext.create('Deft.Deferred');
        
        var pi_ancestor_field_name = this._getPortfolioItemFieldName() + '.ObjectID';
        var filters = []; 
        var idx = -1;
        var counter = 0;
        Ext.each(portfolio_items_data, function(pi){
            var filter = Ext.create('Rally.data.wsapi.Filter',{
                property: pi_ancestor_field_name,
                value: pi.get('ObjectID')
            });
            if (counter % this.CHUNK_SIZE == 0){
                if (idx >= 0) {this.logger.log('_fetchUserStories: filter', filters[idx].toString())};
                idx++;
                filters[idx] = filter;  
            } else {
                filters[idx] = filters[idx].or(filter);
            }
            counter++;
        },this);
        
        var promises = [];
        Ext.each(filters, function(f){
            promises.push(this._createWsapiStore('HierarchicalRequirement',this.userStoryFetchFields, f));
        },this);
        
        Deft.Promise.all(promises).then({
            scope:this,
            success: function(data){
                var user_story_data = _.flatten(data);
                this.logger.log('_fetchUserStories Promise complete:',data, user_story_data.length);
                deferred.resolve(user_story_data);
            },
            failure: function(error){
                this.logger.log('_fetchUserStories Promise failed', error);
            }
        });
        return deferred;
    },
    _fetchIterations: function(releaseStartDate, releaseEndDate, unscheduledFieldName, outsideReleaseFieldName){
        var deferred = Ext.create('Deft.Deferred');
        
        var filters = Ext.create('Rally.data.wsapi.Filter',{
            property: 'StartDate',
            operator: '<',
            value: Rally.util.DateTime.toIsoString(new Date(releaseEndDate))
        });
        filters = filters.and(Ext.create('Rally.data.wsapi.Filter',{
            property: 'EndDate',
            operator: '>',
            value: Rally.util.DateTime.toIsoString(new Date(releaseStartDate))
        }));
        var sorter = [{
                property: 'StartDate',
                direction: 'ASC'
        }];
        var context = {projectScopeDown: false};
        this.logger.log('_fetchIterations',filters.toString(),sorter);
        var fetch = ['Name','StartDate','EndDate','ObjectID'];
        this._createWsapiStore('Iteration',fetch, filters, sorter, context).then({
            scope: this,
            success: function(data){
               // var iterations = [];
                this.iterationMap = {};
                Ext.each(data, function(d){
                    var iteration = 'I' + d.get('ObjectID');
                    this.iterationMap[iteration] = d.get('Name');
                //    iterations.push(iteration);
                },this);
                
                //console.log(iterations);               
                //iterations.push(unscheduledFieldName);
                //iterations.push(outsideReleaseFieldName);
                deferred.resolve();
            },
            failure: function(error){
                deferred.reject('Error fetching Iterations: ' + error);
            }
        });
        return deferred; 
    },
    _createWsapiStore: function(model, fetch, filter,sorter,context){
        this.logger.log('_createWsapiStore',model, fetch,filter.toString());
        if (sorter == undefined){
            sorter=[{property: 'ObjectID', direction: 'ASC'}];
        }
        if (context == undefined){
            context = {};
        }
        var deferred = Ext.create('Deft.Deferred');
        Ext.create('Rally.data.wsapi.Store',{
            model: model,
            fetch: fetch,
            autoLoad: true,
            filters: filter,
            sorter: sorter,
            context: context,
            limit: 'Infinity',
            listeners: {
                scope: this,
                load: function(store,data,success){
                    this.logger.log('_createWsapiStore: Store loaded',store,success);
                    if (success){
                        deferred.resolve(data);
                    } else {
                        deferred.reject('Store failed to load.', model, fetch, filter.toString());
                    }
                }
            }
        });
        return deferred;
    },
    
    _createTree: function(tree_store, columns){
            
            var tree = this.add({
                xtype:'treepanel',
                store: tree_store,
                cls: 'rally-grid',
                rootVisible: false,
                rowLines: true,
                height: this.height,
                columns: columns
            });
    },

    _constructColumns: function(){
        var columns = [
                       {
                           xtype: 'treecolumn',
                           text: 'Item',
                           dataIndex: 'FormattedID',
                           itemId: 'tree_column',
                           width: 300
                       }];
        
        Ext.each(Object.keys(this.iterationMap), function(key){
            columns.push({
                text: this.iterationMap[key],
                dataIndex: key
            });
        },this);
        
        columns.push({text:this.unscheduledFieldName, dataIndex: this.unscheduledFieldName});
        columns.push({text:this.outsideReleaseFieldName, dataIndex: this.outsideReleaseFieldName});
        
        this.logger.log('_constructColumns',columns);
        return columns; 
    },
    buildRoot: function(parentField, inputData,iterations,unscheduledIterationName, outsideReleaseIterationName){
        this.logger.log('buildRoot', inputData);
        var model_hash = Rally.technicalservices.util.TreeBuilding.prepareModelHash(inputData,parentField);
        
        model_hash = this._addColumnsAndBucketData(model_hash);
        var root_array = Rally.technicalservices.util.TreeBuilding.constructRootItems(model_hash);
        
        Rally.technicalservices.util.TreeBuilding.rollup({root_items: root_array, field_name: this.unscheduledFieldName, leaves_only: true, calculator: function(item){return item.get(this.unscheduledFieldName) || 0;}});
        Rally.technicalservices.util.TreeBuilding.rollup({root_items: root_array, field_name: this.outsideReleaseFieldName, leaves_only: true, calculator:function(item){return item.get(this.outsideReleaseFieldName) || 0;}});
        Ext.each(Object.keys(this.iterationMap),function(key){
            Rally.technicalservices.util.TreeBuilding.rollup({root_items: root_array, field_name: key, leaves_only: true, calculator: function(item){return item.get(key) || 0;}});
            
        },this);
        root_array = Rally.technicalservices.util.TreeBuilding.convertModelsToHashes(root_array);
        this.logger.log('build: root_array',root_array);
        return root_array; 
    },

    _addColumnsAndBucketData: function(model_hash){
        
        Ext.Object.each(model_hash, function(key, model){
            Ext.each(Object.keys(this.iterationMap), function(key){
                model.set(key, 0);
            });
            model.set(this.unscheduledIterationName,0);
            model.set(this.outsideReleaseIterationName,0);
            
            var model_iteration = this.unscheduledFieldName;
            if (model.get('Iteration')){
                model_iteration = this.outsideReleaseFieldName;
                var iteration_name = model.get('Iteration').Name;
                var key = Ext.Object.getKey(this.iterationMap, iteration_name);
                if (key){
                    model_iteration = key;
                }
            }
            if (model.get('PlanEstimate')){
                model.set(model_iteration,model.get('PlanEstimate'));
            } 
        }, this);
        this.logger.log('_addColumnsAndBucketData', model_hash, this.iterationMap);
        return model_hash; 
    }
});