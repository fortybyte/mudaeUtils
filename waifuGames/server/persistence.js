const fs = require('fs').promises;
const path = require('path');

class Persistence {
  constructor() {
    this.dataFile = path.join(__dirname, 'instances.json');
    // Initialize file immediately
    this.ensureDataFile().catch(err => console.error('Failed to ensure data file:', err));
  }

  async ensureDataFile() {
    try {
      await fs.access(this.dataFile);
      console.log('instances.json file exists');
    } catch {
      console.log('Creating instances.json file...');
      await this.saveInstances({});
    }
  }

  async loadInstances() {
    try {
      const data = await fs.readFile(this.dataFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading instances:', error);
      return {};
    }
  }

  async saveInstances(instances) {
    try {
      const data = JSON.stringify(instances, null, 2);
      await fs.writeFile(this.dataFile, data, 'utf-8');
      console.log(`Saved ${Object.keys(instances).length} instances to disk`);
    } catch (error) {
      console.error('Error saving instances:', error);
    }
  }

  async saveInstance(id, instanceData) {
    const instances = await this.loadInstances();
    instances[id] = {
      ...instanceData,
      lastSaved: new Date().toISOString()
    };
    await this.saveInstances(instances);
    console.log(`Saved instance ${id} to persistence`);
  }

  async removeInstance(id) {
    const instances = await this.loadInstances();
    delete instances[id];
    await this.saveInstances(instances);
    console.log(`Removed instance ${id} from persistence`);
  }

  async getInstance(id) {
    const instances = await this.loadInstances();
    return instances[id] || null;
  }
}

module.exports = new Persistence();