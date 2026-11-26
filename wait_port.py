import re

with open('hub.py', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''    ACTIVE_MODULE = module_name
    
    return True'''

replacement = '''    ACTIVE_MODULE = module_name
    
    # Wait for the new module to bind to port 5003
    import socket
    start_time = time.time()
    while time.time() - start_time < 30: # Wait up to 30 seconds
        try:
            with socket.create_connection(('127.0.0.1', 5003), timeout=1):
                return True
        except OSError:
            time.sleep(0.5)
            
    return False'''

content = content.replace(target, replacement)

with open('hub.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated hub.py with wait_for_port logic")
