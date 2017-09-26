var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    Model = mongoose.Model,
    util = require('util');

/**
 * This code is taken from official mongoose repository
 * https://github.com/Automattic/mongoose/blob/master/lib/query.js#L1996-L2018
 */
/* istanbul ignore next */
function parseUpdateArguments (conditions, doc, options, callback) {
    if ('function' === typeof options) {
        // .update(conditions, doc, callback)
        callback = options;
        options = null;
    } else if ('function' === typeof doc) {
        // .update(doc, callback);
        callback = doc;
        doc = conditions;
        conditions = {};
        options = null;
    } else if ('function' === typeof conditions) {
        // .update(callback)
        callback = conditions;
        conditions = undefined;
        doc = undefined;
        options = undefined;
    } else if (typeof conditions === 'object' && !doc && !options && !callback) {
        // .update(doc)
        doc = conditions;
        conditions = undefined;
        options = undefined;
        callback = undefined;
    }

    var args = [];

    if (conditions) args.push(conditions);
    if (doc) args.push(doc);
    if (options) args.push(options);
    if (callback) args.push(callback);

    return args;
}

function parseIndexFields (options) {
    var indexFields = {
        deleted: false,
        deleted_at: false,
        deleted_by: false
    };

    if (!options.indexFields) {
        return indexFields;
    }

    if ((typeof options.indexFields === 'string' || options.indexFields instanceof String) && options.indexFields === 'all') {
        indexFields.deleted = indexFields.deleted_at = indexFields.deleted_by = true;
    }

    if (typeof(options.indexFields) === "boolean" && options.indexFields === true) {
        indexFields.deleted = indexFields.deleted_at = indexFields.deleted_by = true;
    }

    if (Array.isArray(options.indexFields)) {
        indexFields.deleted = options.indexFields.indexOf('deleted') > -1;
        indexFields.deleted_at = options.indexFields.indexOf('deleted_at') > -1;
        indexFields.deleted_by = options.indexFields.indexOf('deleted_by') > -1;
    }

    return indexFields;
}

function createSchemaObject (typeKey, typeValue, options) {
    options[typeKey] = typeValue;
    return options;
}

module.exports = function (schema, options) {
    options = options || {};
    var indexFields = parseIndexFields(options)

    var typeKey = schema.options.typeKey;

    schema.add({ deleted: createSchemaObject(typeKey, Boolean, { default: false, index: indexFields.deleted }) });

    if (options.deleted_at === true) {
        schema.add({ deleted_at: createSchemaObject(typeKey, Date, { index: indexFields.deleted_at }) });
    }

    if (options.deleted_by === true) {
        schema.add({ deleted_by: createSchemaObject(typeKey, options.deletedByType || Schema.Types.ObjectId, { index: indexFields.deleted_by }) });
    }

    schema.pre('save', function (next) {
        if (!this.deleted) {
            this.deleted = false;
        }
        next();
    });

    if (options.overrideMethods) {
        var overrideItems = options.overrideMethods;
        var overridableMethods = ['count', 'find', 'findOne', 'findOneAndUpdate', 'update'];
        var finalList = [];

        if ((typeof overrideItems === 'string' || overrideItems instanceof String) && overrideItems === 'all') {
            finalList = overridableMethods;
        }

        if (typeof(overrideItems) === "boolean" && overrideItems === true) {
            finalList = overridableMethods;
        }

        if (Array.isArray(overrideItems)) {
            overrideItems.forEach(function(method) {
                if (overridableMethods.indexOf(method) > -1) {
                    finalList.push(method);
                }
            });
        }

        finalList.forEach(function(method) {
            if (method === 'count' || method === 'find' || method === 'findOne') {
                schema.statics[method] = function () {
                    return Model[method].apply(this, arguments).where('deleted').ne(true);
                };
                schema.statics[method + 'Deleted'] = function () {
                    return Model[method].apply(this, arguments).where('deleted').ne(false);
                };
                schema.statics[method + 'WithDeleted'] = function () {
                    return Model[method].apply(this, arguments);
                };
            } else {
                schema.statics[method] = function () {
                    var args = parseUpdateArguments.apply(undefined, arguments);

                    args[0].deleted = {'$ne': true};

                    return Model[method].apply(this, args);
                };

                schema.statics[method + 'Deleted'] = function () {
                    var args = parseUpdateArguments.apply(undefined, arguments);

                    args[0].deleted = {'$ne': false};

                    return Model[method].apply(this, args);
                };

                schema.statics[method + 'WithDeleted'] = function () {
                    return Model[method].apply(this, arguments);
                };
            }
        });
    }

    schema.methods.delete = function (deleted_by, cb) {
        if (typeof deleted_by === 'function') {
          cb = deleted_by
          deleted_by = null
        }

        this.deleted = true;

        if (schema.path('deleted_at')) {
            this.deleted_at = new Date();
        }

        if (schema.path('deleted_by')) {
            this.deleted_by = deleted_by;
        }

        if (options.validateBeforeDelete === false) {
            return this.save({ validateBeforeSave: false }, cb);
        }

        return this.save(cb);
    };

    schema.statics.delete =  function (conditions, deleted_by, callback) {
        if (typeof deleted_by === 'function') {
            callback = deleted_by;
            conditions = conditions;
            deleted_by = null;
        } else if (typeof conditions === 'function') {
            callback = conditions;
            conditions = {};
            deleted_by = null;
        }

        var doc = {
            deleted: true
        };

        if (schema.path('deleted_at')) {
            doc.deleted_at = new Date();
        }

        if (schema.path('deleted_by')) {
            doc.deleted_by = deleted_by;
        }

        if (this.updateWithDeleted) {
            return this.updateWithDeleted(conditions, doc, { multi: true }, callback);
        } else {
            return this.update(conditions, doc, { multi: true }, callback);
        }
    };

    schema.methods.restore = function (callback) {
        this.deleted = false;
        this.deleted_at = undefined;
        this.deleted_by = undefined;
        return this.save(callback);
    };

    schema.statics.restore =  function (conditions, callback) {
        if (typeof conditions === 'function') {
            callback = conditions;
            conditions = {};
        }

        var doc = {
            deleted: false,
            deleted_at: undefined,
            deleted_by: undefined
        };

        if (this.updateWithDeleted) {
            return this.updateWithDeleted(conditions, doc, { multi: true }, callback);
        } else {
            return this.update(conditions, doc, { multi: true }, callback);
        }
    };
};
