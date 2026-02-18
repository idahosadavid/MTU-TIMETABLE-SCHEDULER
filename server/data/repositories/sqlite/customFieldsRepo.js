const { allAsync, runAsync } = require('./helpers');

const list = () => allAsync('SELECT * FROM custom_fields');

const create = async ({ name, label, type, required }) => {
    const result = await runAsync(
        'INSERT INTO custom_fields (name, label, type, required) VALUES (?, ?, ?, ?)',
        [name, label, type, required ? 1 : 0]
    );
    return { id: result.lastID };
};

const deleteById = (id) => runAsync('DELETE FROM custom_fields WHERE id = ?', [id]);

module.exports = { list, create, deleteById };
