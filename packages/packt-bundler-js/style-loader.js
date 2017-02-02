function(assetName, content) {
  if (typeof document !== 'object' || !document.createElement) {
    global._cssMarkup = global._cssMarkup || [];
    global._cssMarkup.push({
      id: assetName,
      css: content,
    });
    return;
  }

  var head = document.getElementsByTagName('head')[0];
  var styleElement = head.querySelector('[data-packt-id]="' assetName + '"');

  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.type = 'text/css';
    styleElement.setAttribute('data-packt-id',assetName);
    head.appendChild(styleElement);
    if (styleElement.styleSheet) {
      styleElement.styleSheet.cssText = content;
    } else {
      styleElement.appendChild(document.createTextNode(content));
    }
  }
}
