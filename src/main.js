
function sendUserError(message) {
  var cc = DataStudioApp.createCommunityConnector();
  cc.newUserError().setText(message).throwException();
}

function getAuthType() {
  var response = { type: 'NONE' };
  return response;
}

function getConfig(request) {
  var communityConnector = DataStudioApp.createCommunityConnector();
  var connectorConfig = communityConnector.getConfig();
  
  connectorConfig.setDateRangeRequired(false);
    
  connectorConfig.newTextInput()
    .setId('url')
    .setName('Enter the URL of your CSV')
    .setAllowOverride(true);

  connectorConfig.newSelectSingle()
    .setId('delimiter')
    .setName('Select the delimiter between each value')
    .setAllowOverride(true)
    .addOption(connectorConfig.newOptionBuilder().setLabel('Comma').setValue(','))
    .addOption(connectorConfig.newOptionBuilder().setLabel('Semicolon').setValue(';'))
    .addOption(connectorConfig.newOptionBuilder().setLabel('Tabulation').setValue('\t'));
  
  connectorConfig.newSelectSingle()
    .setId('textQualifier')
    .setName('Does the values have a text qualifier?')
    .setAllowOverride(true)
    .addOption(connectorConfig.newOptionBuilder().setLabel('No value').setValue('undefined'))
    .addOption(connectorConfig.newOptionBuilder().setLabel('Simple quote').setValue("'"))
    .addOption(connectorConfig.newOptionBuilder().setLabel('Double quote').setValue('"'));
  
  connectorConfig.newSelectSingle()
    .setId('containsHeader')
    .setName('Does your CSV have a header row?')
    .setAllowOverride(true)
    .addOption(connectorConfig.newOptionBuilder().setLabel('True').setValue('true'))
    .addOption(connectorConfig.newOptionBuilder().setLabel('False').setValue('false'));
    
  return connectorConfig.build();
}

function findLineSeparator(content) {
  if (!content) {
    return undefined;
  }
  if (content.indexOf('\r\n') >= 0) { // Windows
    return '\r\n';
  } else if (content.indexOf('\r') >= 0) { // MacOS
    return '\r';
  } else if (content.indexOf('\n') >= 0) { // Linux / OSX
    return '\n';
  } else {
    return undefined;
  }
}

function fetchData(url) {
  if (!url || !url.match(/^https?:\/\/.+$/g)) {
    sendUserError("Input error: Invalid URL");
  }
  var response = UrlFetchApp.fetch(url);
  var content = response.getContentText();
  if (!content) {
    sendUserError("Error during parsing content: Empty content");
  }
  return content;
}

function getFields(request, content) {
  var communityConnector = DataStudioApp.createCommunityConnector();
  var fields = communityConnector.getFields();
  var types = communityConnector.FieldType;
  var textQualifier = request.configParams.textQualifier;
  var containsHeader = request.configParams.containsHeader;
  
  var lineSeparator = findLineSeparator(content);
  var firstLineContent;
  if (lineSeparator) {
    firstLineContent = content.substring(0, content.indexOf(lineSeparator));
  } else {
    firstLineContent = content;
  }
  var valueSeparator = request.configParams.delimiter;
  if (textQualifier !== 'undefined') {
    firstLineContent = firstLineContent.substring(1, firstLineContent.length - 1);
    separator = textQualifier + valueSeparator + textQualifier;
  }
  var firstLineColumns = firstLineContent.split(valueSeparator);
  
  var i=1;
  firstLineColumns.forEach(function(value) {
    var field = fields.newDimension().setType(types.TEXT);
    if (containsHeader === 'true') {
      // because Id can't have space
      field.setId(value.replace(/\s/g, '_').toLowerCase());
      field.setName(value);
    } else {
      field.setId('column_' + i);
      i++;
    }
  });
  
  return fields;
}

function getSchema(request) {
  var content = fetchData(request.configParams.url);
  var fields = getFields(request, content).build();
  return { schema: fields };
}

function getData(request) {
  var content = fetchData(request.configParams.url);
  var requestedFieldIds = request.fields.map(function(field) {
    return field.name;
  });
  var fields = getFields(request, content);
  var requestedFields = fields.forIds(requestedFieldIds);
  var buildedFields = fields.build();
  
  var requestedFieldsIndex = buildedFields.reduce(function(filtered, field, index) {
    if (requestedFieldIds.indexOf(field.name) >=0 ) {
      filtered.push(index);
    }
    return filtered;
  }, []);
  
  var textQualifier = request.configParams.textQualifier;
  var delimiter = request.configParams.delimiter;
  var containsHeader = request.configParams.containsHeader;
  
  var lineSeparator = findLineSeparator(content);
  var contentRows;
  if (lineSeparator) {
    contentRows = content.split(lineSeparator);
  } else {
    contentRows = [content];
  }
  var valueSeparator = delimiter;
  if (textQualifier !== 'undefined') {
    valueSeparator = textQualifier + valueSeparator + textQualifier;
  }
  
  var rows = contentRows.map(function(contentRow) {
    if (textQualifier !== 'undefined') {
      contentRow = contentRow.substring(1, contentRow.length - 1);
    }
    var allValues = contentRow.split(valueSeparator);
    if (buildedFields.length !== allValues.length) {
      sendUserError("Error during parsing content: the number of columns on each row is not respect");
    }
    var requestedValues = allValues.filter(function(value, index) {
      return requestedFieldsIndex.indexOf(index) >= 0;
    });
    return { values: requestedValues };
  });
  if (containsHeader === 'true') {
    rows = rows.slice(1);
  }
  
  var result = {
    schema: requestedFields.build(),
    rows: rows
  };
  
  return result;
}
