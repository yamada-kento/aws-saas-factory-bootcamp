'use strict';

// Configure Express
const express = require('express');
const bodyParser = require('body-parser');
//Configure AWS SDK
const AWS = require('aws-sdk');
//Configure Environment
const configModule = require('../shared-modules/config-helper/config.js');
var configuration = configModule.configure(process.env.NODE_ENV);
//Configure Logging
const winston = require('winston');
winston.add(new winston.transports.Console({level: configuration.loglevel}));
//Include Custom Modules
const tokenManager = require('../shared-modules/token-manager/token-manager.js');
const DynamoDBHelper = require('../shared-modules/dynamodb-helper/dynamodb-helper.js');

// Configure AWS Region
AWS.config.update({region: configuration.aws_region});

// Instantiate application
var app = express();

// Configure middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
    res.header("Access-Control-Allow-Headers", "Content-Type, Origin, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token, Access-Control-Allow-Headers, X-Requested-With, Access-Control-Allow-Origin");
    next();
});

// Create a schema
var tenantSchema = {
    TableName: configuration.table.tenant,
    KeySchema: [
        { AttributeName: "tenant_id", KeyType: "HASH"}  //Partition key
    ],
    AttributeDefinitions: [
        { AttributeName: "tenant_id", AttributeType: "S" }
    ],
    ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
    }
};

app.get('/tenant/health', function(req, res) {
    res.status(200).send({service: 'Tenant Manager', isAlive: true});
});

// Create REST entry points
app.get('/tenant/:id', function (req, res) {
    winston.debug('Fetching tenant: ' + req.params.id);

    // init params structure with request params
    var tenantIdParam = {
        tenant_id: req.params.id
    }

    tokenManager.getCredentialsFromToken(req, function(credentials) {
        // construct the helper object
        var dynamoHelper = new DynamoDBHelper(tenantSchema, credentials, configuration);

        dynamoHelper.getItem(tenantIdParam, credentials, function (err, tenant) {
            if (err) {
                winston.error('Error getting tenant: ' + err.message);
                res.status(400).send('{"Error" : "Error getting tenant"}');
            } else {
                winston.debug('Tenant ' + req.params.id + ' retrieved');
                res.status(200).send(tenant);
            }
        });
    });
});

app.get('/tenants', function(req, res) {
    winston.debug('Fetching all tenants');

    tokenManager.getCredentialsFromToken(req, function(credentials) {
        var scanParams = {
            TableName: tenantSchema.TableName,
        }

        // construct the helper object
        var dynamoHelper = new DynamoDBHelper(tenantSchema, credentials, configuration);

        dynamoHelper.scan(scanParams, credentials, function (error, tenants) {
            if (error) {
                winston.error('Error retrieving tenants: ' + error.message);
                res.status(400).send('{"Error" : "Error retrieving tenants"}');
            } else {
                winston.debug('Tenants successfully retrieved');
                res.status(200).send(tenants);
            }
        });
    });
});

app.post('/tenant', function(req, res) {
    var credentials = {};
    tokenManager.getSystemCredentials(function (systemCredentials) {
        credentials = systemCredentials;
        var tenant = req.body;
        winston.debug("tenant-manager POST new tenant");
        winston.debug(tenant);
        winston.debug('Creating Tenant: ' + tenant.tenant_id);

        // construct the helper object
        var dynamoHelper = new DynamoDBHelper(tenantSchema, credentials, configuration);

        dynamoHelper.putItem(tenant, credentials, function (err, data) {
            if (err) {
                winston.error('Error calling putItem for new tenant: ' + err.message);
                res.status(400).send('{"Error" : "Error creating tenant"}');
            } else {
                // data will be null because ReturnValues == NONE
                winston.debug('Tenant ' + tenant.tenant_id + ' created');
                res.status(200).send({status: 'success'});
            }
        });
    })
});

app.put('/tenant', function(req, res) {
    winston.debug('Updating tenant: ' + req.body.id);
    tokenManager.getCredentialsFromToken(req, function(credentials) {
        // init the params from the request data
        var keyParams = {
            tenant_id: req.body.id
        }

        var tenantUpdateParams = {
            TableName: tenantSchema.TableName,
            Key: keyParams,
            UpdateExpression: "set " +
                "companyName = :companyName, " +
                "accountName = :accountName, " +
                "ownerName = :ownerName, " +
                "tier = :tier, " +
                "#status = :status",
            ExpressionAttributeNames: {
                '#status' : 'status'
            },
            ExpressionAttributeValues: {
                ":companyName": req.body.companyName,
                ":accountName": req.body.accountName,
                ":ownerName": req.body.ownerName,
                ":tier": req.body.tier,
                ":status": req.body.status
            },
            ReturnValues:"UPDATED_NEW"
        };

        // construct the helper object
        var dynamoHelper = new DynamoDBHelper(tenantSchema, credentials, configuration);

        dynamoHelper.updateItem(tenantUpdateParams, credentials, function (err, tenant) {
            if (err) {
                winston.error('Error updating tenant: ' + err.message);
                res.status(400).send('{"Error" : "Error updating tenant"}');
            }
            else {
                winston.debug('Tenant ' + tenant.tenant_id + ' updated');
                res.status(200).send(tenant);
            }
        });
    });
});

app.delete('/tenant/:id', function(req, res) {
    winston.debug('Deleting Tenant: ' + req.params.id);

    tokenManager.getCredentialsFromToken(req, function(credentials) {
        // init parameter structure
        var deleteTenantParams = {
            TableName : tenantSchema.TableName,
            Key: {
                tenant_id: req.params.id
            }
        };

        // construct the helper object
        var dynamoHelper = new DynamoDBHelper(tenantSchema, credentials, configuration);

        dynamoHelper.deleteItem(deleteTenantParams, credentials, function (err, product) {
            if (err) {
                winston.error('Error deleting tenant: ' + err.message);
                res.status(400).send('{"Error" : "Error deleting tenant"}');
            }
            else {
                winston.debug('Tenant ' + req.params.id + ' deleted');
                res.status(200).send({status: 'success'});
            }
        });
    });
});


// Start the servers
app.listen(configuration.port.tenant);
console.log(configuration.name.tenant + ' service started on port ' + configuration.port.tenant);