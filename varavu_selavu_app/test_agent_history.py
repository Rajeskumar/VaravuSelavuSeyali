import os
from langchain_ollama import ChatOllama
from langgraph.prebuilt import create_react_agent
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, AIMessage

@tool
def get_weather(city: str) -> str:
    """Get weather for a city"""
    return f"The weather in {city} is sunny."

llm = ChatOllama(model="llama3.1", temperature=0)
agent = create_react_agent(llm, [get_weather])

msgs = [
    HumanMessage(content="What is the weather in Paris?"),
    AIMessage(content="The weather in Paris is sunny."),
    HumanMessage(content="What about London?")
]

res = agent.invoke({"messages": msgs})
for m in res["messages"]:
    print(m.__class__.__name__, m.content)
