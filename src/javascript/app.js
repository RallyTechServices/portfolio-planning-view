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
    userStoryFetchFields: ['ObjectID','FormattedID','Name','PlanEstimate','Iteration','Name','StartDate','EndDate'],
    
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
        this.logger.log('_run: release_filter', release_filter.toString(), 'feature_filter', feature_filter);
        
        var treeStore = Ext.create('Rally.technicalservices.data.ArtifactTree',{});
        this._fetchPortfolioItems(release_filter, feature_filter).then({
            scope: this,
            success: function(pi_data){
                this.logger.log('fetchPortfolioItems success', pi_data);
                treeStore.inputData[0] = pi_data;
                this._fetchUserStories(pi_data).then({
                    scope: this,
                    success: function(user_story_data){
                        this.logger.log('fetchUserStories success', user_story_data);
                        treeStore.inputData[1] = user_story_data;  
                        treeStore.build();
                    },
                    failure: function(error){
                        this.logger.log('_fetchUserStories return error',error);
                    }
                });
            },
            failure: function(error){
                this.logger.log('_fetchPortfolioItems return error',error);
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
    _createWsapiStore: function(model, fetch, filter){
        this.logger.log('_createWsapiStore',model, fetch,filter.toString());
        var deferred = Ext.create('Deft.Deferred');
        Ext.create('Rally.data.wsapi.Store',{
            model: model,
            fetch: fetch,
            autoLoad: true,
            filters: filter,
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
    }
});